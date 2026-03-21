import express, { Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import oracledb from 'oracledb';
import { Message, LoadEquipmentsRequest, ProcessPartidasRequest, Step7Request } from './models';
import { getOracleConnection, pg } from './db';
import { validar, Contenedor, Partida } from './utils/algorithm';

dotenv.config();

const app = express();
const port = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ── Endpoints ─────────────────────────────────────────────────────────────────

/**
 * Step 1: Get messages (REAL LOGIC).
 */
app.get('/messages', async (req: Request, res: Response) => {
  console.log("GET /messages called - querying Oracle");

  let conn;
  try {
    conn = await getOracleConnection();
    const sql = `
      SELECT cm.ID_INTERNO,
             cm.MESSAGE_DATE,
             cm.PORT_CALL_NUMBER,
             cm.NUM_CONTENEDORES
      FROM   PORTIC.COPRAR_MENSAJES cm
      WHERE  cm.RECEIVER_UNB       = 'ESQ0817002I'
        AND  cm.CONTAINER_LIST_TYPE = '121'
        AND  cm.CONTAINER_LIST_TARGET = 'COPORD'
        AND  cm.ESTADO              = 'OKSI'
        AND  cm.MESSAGE_DATE        > SYSDATE - 5
        AND  ROWNUM                 < 10
    `;

    const result = await conn.execute<any[]>(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    res.json(result.rows);
  } catch (err) {
    console.error("Error in GET /messages:", err);
    res.status(500).json({ error: "Failed to fetch messages from Oracle" });
  } finally {
    if (conn) {
      await conn.close();
    }
  }
});

/**
 * Step 2: Load equipments (REAL LOGIC).
 */
app.post('/load-equipments', async (req: Request<{}, {}, LoadEquipmentsRequest>, res: Response) => {
  const { id_interno, port_call_number, max_registros } = req.body;

  console.log(`POST /load-equipments called for ID=${id_interno}`);

  if (!id_interno || !port_call_number || !max_registros) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  let oraConn;
  try {
    oraConn = await getOracleConnection();

    // 2a. Query Oracle
    const sqlOra = `
      SELECT ce.EQUIPMENT_ID_NUMBER,
             ce.EQUIPMENT_TYPE,
             ce.VGM_PESO_VERIFICADO
      FROM   PORTIC.COPRAR_EQUIPAMIENTOS ce
      WHERE  ce.ID_INTERNO             = :id_interno
        AND  ce.FULL_EMPTY_INDICATOR   = 5
        AND  ce.VGM_PESO_VERIFICADO    IS NOT NULL
        AND  ROWNUM                   <= :max_reg
    `;

    const resultOra = await oraConn.execute<any[]>(sqlOra, [id_interno, max_registros], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const rows = resultOra.rows || [];

    if (rows.length === 0) {
      return res.json({ status: "warning", message: "No equipments found in Oracle", count: 0 });
    }

    // 2b. Delete previous PG records
    await pg.query("DELETE FROM equipamientos_escala WHERE escala = $1", [port_call_number]);

    // 2c & 2d. Insert and Update Tara in PG
    for (const row of rows as any[]) {
      const { EQUIPMENT_ID_NUMBER, EQUIPMENT_TYPE, VGM_PESO_VERIFICADO } = row;

      const insertSql = `
        INSERT INTO equipamientos_escala (id_lista, escala, equipamiento, tipo, peso, tara)
        VALUES ($1, $2, $3, $4, $5, NULL)
        RETURNING id
      `;
      await pg.query(insertSql, [
        id_interno,
        port_call_number,
        EQUIPMENT_ID_NUMBER,
        EQUIPMENT_TYPE,
        Math.round(VGM_PESO_VERIFICADO || 0)
      ]);

      const updateSql = `
        UPDATE equipamientos_escala ee
        SET    tara = t.peso
        FROM   taras t
        WHERE  ee.equipamiento = $1
          AND  t.tipo    = ee.tipo
      `;
      await pg.query(updateSql, [EQUIPMENT_ID_NUMBER]);
    }

    res.json({ status: "success", count: rows.length, mode: "real" });
  } catch (err) {
    console.error("Error in POST /load-equipments:", err);
    res.status(500).json({ error: "Failed to load equipments" });
  } finally {
    if (oraConn) await oraConn.close();
  }
});

/**
 * Step 3: Load partidas (REAL LOGIC).
 */
app.post('/load-partidas', async (req: Request<{}, {}, ProcessPartidasRequest>, res: Response) => {
  const { id_interno, port_call_number } = req.body;

  console.log(`POST /load-partidas called for PCN=${port_call_number}, ID_INTERNO=${id_interno}`);

  if (!id_interno || !port_call_number) {
    return res.status(400).json({ error: "Missing required fields (id_interno or port_call_number)" });
  }

  let oraConn;
  try {
    // 3a. Delete previous records for this id_lista in PG
    await pg.query("DELETE FROM partidas_equipamiento WHERE idlista = $1", [id_interno]);
    console.log(`  → DELETE partidas_equipamiento WHERE idlista=${id_interno}`);

    // 3b. Get equipments from PG
    const pgRes = await pg.query("SELECT equipamiento FROM equipamientos_escala WHERE escala = $1", [port_call_number]);
    const equipments = pgRes.rows.map(r => r.equipamiento);

    if (equipments.length === 0) {
      return res.json({ status: "warning", message: "No equipments found in PostgreSQL for this scale", count: 0 });
    }

    oraConn = await getOracleConnection();
    let totalInserted = 0;

    // Process in chunks of 500
    const CHUNK_SIZE = 500;
    for (let i = 0; i < equipments.length; i += CHUNK_SIZE) {
      const chunk = equipments.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map((_, idx) => `:${idx + 1}`).join(', ');

      const sqlPartidas = `
        SELECT td.ID,
               td.FECHA_ALTA,
               td.NUM_DOC,
               tp.NUM_PAR,
               tp.PESO_B,
               te.ID_EQUIPAMIENTO,
               ttd.TIPO,
               ted.NOMBRE,
               te2.FECHA_EVENTO,
               tce.NOMBRE_EVENTO
        FROM   portic.TDA_EQUIPAMIENTOS  te,
               portic.TDA_PARTIDAS       tp,
               portic.TDA_DOCUMENTOS     td,
               portic.TDA_TIPO_DOCUMENTO ttd,
               portic.TDA_ESTAT_DOCUMENTO ted,
               portic.TDA_EVENTOS        te2,
               portic.TDA_CODIGOS_EVENTO tce
        WHERE  te.ID_EQUIPAMIENTO      IN (${placeholders})
          AND  td.FECHA_ALTA           > ADD_MONTHS(SYSDATE, -3)
          AND  tp.ID                   = te.TDA_PARTIDASID
          AND  td.ID                   = tp.TDA_DOCUMENTOSID
          AND  td.REC_ENVIO            LIKE '0812%'
          AND  td.TDA_TIPO_DOCUMENTOID IN (1, 2, 5, 8, 6)
          AND  ttd.ID                  = td.TDA_TIPO_DOCUMENTOID
          AND  ted.ID                  = td.TDA_ESTAT_DOCUMENTOID
          AND  te2.TDA_DOCUMENTOSID    = td.ID
          AND  tce.ID                  = te2.TDA_CODIGOS_EVENTOID
        ORDER BY te2.FECHA_EVENTO DESC
      `;

      const oraRes = await oraConn.execute<any[]>(sqlPartidas, chunk, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const rows = oraRes.rows || [];

      for (const r of rows as any[]) {
        const id_doc_partida = `${r.NUM_DOC}-${r.NUM_PAR}`;
        const insertPartidaSql = `
          INSERT INTO partidas_equipamiento
              (fecha_alta, id_documento_partida, peso, tipo_documento,
               fecha_evento, nombre_evento, equipamiento, idlista, escala)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;
        await pg.query(insertPartidaSql, [
          r.FECHA_ALTA,
          id_doc_partida,
          Math.round(r.PESO_B || 0),
          r.TIPO,
          r.FECHA_EVENTO,
          r.NOMBRE_EVENTO,
          r.ID_EQUIPAMIENTO,
          id_interno,
          parseInt(port_call_number)
        ]);
        totalInserted++;
      }
    }

    // Step 3 Cleanup Logic:
    // 1. Set weight to 0 for unwanted events (interrupción, anulación, salida efectiva, llegada)
    const updateUnwantedSql = `
      UPDATE partidas_equipamiento 
      SET peso = 0
      WHERE escala = $1 and idlista = $2
        AND (
          nombre_evento ILIKE '%interrupcion%' OR 
          nombre_evento ILIKE '%anulacion%' OR 
          nombre_evento ILIKE '%salida efectiva%' OR
          nombre_evento ILIKE '%llegada%'
        )
    `;
    await pg.query(updateUnwantedSql, [port_call_number, id_interno]);

    // 2. Deduplicate: Keep only the most recent fecha_evento per id_documento_partida and equipamiento
    const dedupeSql = `
      DELETE FROM partidas_equipamiento
      WHERE id IN (
        SELECT id
        FROM (
          SELECT id,
                 ROW_NUMBER() OVER(
                   PARTITION BY id_documento_partida, equipamiento, escala 
                   ORDER BY fecha_evento DESC
                 ) as rn
          FROM partidas_equipamiento
          WHERE escala = $1
        ) t
        WHERE t.rn > 1
      )
    `;
    await pg.query(dedupeSql, [port_call_number]);

    res.json({ status: "success", count: totalInserted, mode: "real", message: "Step 3 completed with cleanup" });
  } catch (err) {
    console.error("Error in POST /load-partidas:", err);
    res.status(500).json({ error: "Failed to load partidas" });
  } finally {
    if (oraConn) await oraConn.close();
  }
});

/**
 * Step 4: Fetch results for display.
 */
app.get('/results/equipments', async (req: Request, res: Response) => {
  const { escala } = req.query;
  if (!escala) return res.status(400).json({ error: "Missing escala" });

  try {
    const result = await pg.query(
      "SELECT * FROM equipamientos_escala WHERE escala = $1 ORDER BY equipamiento",
      [escala]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching results equipments:", err);
    res.status(500).json({ error: "Failed to fetch equipment results" });
  }
});

app.get('/results/partidas', async (req: Request, res: Response) => {
  const { idlista } = req.query;
  if (!idlista) return res.status(400).json({ error: "Missing idlista" });

  try {
    const result = await pg.query(
      "SELECT * FROM partidas_equipamiento WHERE idlista = $1 ORDER BY fecha_evento DESC",
      [idlista]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching results partidas:", err);
    res.status(500).json({ error: "Failed to fetch partida results" });
  }
});

/**
 * Step 4 Enhanced: Run the Paso 5 Algorithm with Net Weight.
 */
app.get('/results/validated', async (req: Request, res: Response) => {
  const { escala, id_lista, tolerancia } = req.query;
  if (!escala || !id_lista) {
    return res.status(400).json({ error: "Missing escala or id_lista" });
  }

  try {
    // 1. Fetch Equipments
    const eqRes = await pg.query(
      "SELECT equipamiento, peso, tara FROM equipamientos_escala WHERE escala = $1 ORDER BY equipamiento",
      [escala]
    );

    // 2. Fetch Partidas
    const paRes = await pg.query(
      "SELECT id_documento_partida, peso, equipamiento FROM partidas_equipamiento WHERE idlista = $1",
      [id_lista]
    );

    // 3. Map to Algorithm Interfaces
    const containers: Contenedor[] = eqRes.rows.map(r => ({
      id: r.equipamiento,
      peso: Number(r.peso || 0),
      tara: Number(r.tara || 0)
    }));

    const partidaMap = new Map<string, { id: string, peso: number, contenedores: Set<string> }>();
    paRes.rows.forEach(r => {
      const pid = r.id_documento_partida;
      if (!partidaMap.has(pid)) {
        partidaMap.set(pid, { id: pid, peso: Number(r.peso || 0), contenedores: new Set() });
      }
      partidaMap.get(pid)!.contenedores.add(r.equipamiento);
    });

    const algorithmPartidas: Partida[] = Array.from(partidaMap.values()).map(p => ({
      id: p.id,
      peso: p.peso,
      contenedores: Array.from(p.contenedores)
    }));

    // 4. Run Algorithm
    const tol = tolerancia ? parseInt(tolerancia as string) : 10;
    const result = validar(algorithmPartidas, containers, tol);

    res.json(result);
  } catch (err) {
    console.error("Error in /results/validated:", err);
    res.status(500).json({ error: "Algorithm execution failed" });
  }
});

/**
 * Step 7: Load data from Oracle to PG (coprar_lsp_equipamientos and coprar_lsp_datos).
 */
app.post('/step7/load', async (req: Request<{}, {}, Step7Request>, res: Response) => {
  const { num_escala } = req.body;
  console.log(`POST /step7/load called for escala=${num_escala}`);

  if (!num_escala) {
    return res.status(400).json({ error: "Missing num_escala" });
  }

  let oraConn;
  try {
    // 1. Delete previous records in PG
    await pg.query("DELETE FROM coprar_lsp_datos WHERE id_equipamiento IN (SELECT id FROM coprar_lsp_equipamientos WHERE escala = $1)", [num_escala]);
    await pg.query("DELETE FROM coprar_lsp_equipamientos WHERE escala = $1", [num_escala]);

    oraConn = await getOracleConnection();

    // 2. Query Oracle
    const sqlOra = `
      SELECT DISTINCT 
             clm.MATRICULA, 
             clm.ESTADO, 
             cld.DATO AS numdoc, 
             cld.PESO AS pesopartida
      FROM   PORTIC.COPRAR_LSP_MATRICULA clm, 
             portic.COPRAR_LSP_DATOS cld 
      WHERE  clm.ESCALA = :escala
        AND  cld.ID_SEQ = clm.ID_SEQ
    `;

    const resultOra = await oraConn.execute<any[]>(sqlOra, [num_escala], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const rows = resultOra.rows || [];

    if (rows.length === 0) {
      return res.json({ status: "warning", message: "No data found in Oracle for this scale", count: 0 });
    }

    // 3. Insert into PG
    const equipmentMap = new Map<string, number>();

    for (const row of rows as any[]) {
      const { MATRICULA, ESTADO, NUMDOC, PESOPARTIDA } = row;

      let equipmentId: number;

      if (!equipmentMap.has(MATRICULA)) {
        const insertEqSql = `
          INSERT INTO coprar_lsp_equipamientos (escala, equipamiento, estado)
          VALUES ($1, $2, $3)
          RETURNING id
        `;
        const eqRes = await pg.query(insertEqSql, [num_escala, MATRICULA, ESTADO]);
        equipmentId = eqRes.rows[0].id;
        equipmentMap.set(MATRICULA, equipmentId);
      } else {
        equipmentId = equipmentMap.get(MATRICULA)!;
      }

      const insertDataSql = `
        INSERT INTO coprar_lsp_datos (id_equipamiento, numdoc, peso)
        VALUES ($1, $2, $3)
      `;
      await pg.query(insertDataSql, [equipmentId, NUMDOC, Math.round(PESOPARTIDA || 0)]);
    }

    res.json({ status: "success", count: rows.length, equipmentsCount: equipmentMap.size });
  } catch (err) {
    console.error("Error in POST /step7/load:", err);
    res.status(500).json({ error: "Failed to load step 7 data" });
  } finally {
    if (oraConn) await oraConn.close();
  }
});

/**
 * Step 7: Get results (hierarchical: equipment -> documents).
 */
app.get('/step7/results', async (req: Request, res: Response) => {
  const { escala } = req.query;
  if (!escala) return res.status(400).json({ error: "Missing escala" });

  try {
    const sql = `
      SELECT DISTINCT
             e.id AS equipment_id, 
             e.equipamiento, 
             e.estado, 
             d.numdoc, 
             d.peso
      FROM   coprar_lsp_equipamientos e
      LEFT JOIN coprar_lsp_datos d ON e.id = d.id_equipamiento
      WHERE  e.escala = $1
      ORDER BY e.equipamiento, d.numdoc
    `;

    const result = await pg.query(sql, [escala]);
    
    // Transform to hierarchy
    const hierarchy: any[] = [];
    const eqMap = new Map<string, any>();

    result.rows.forEach(r => {
      if (!eqMap.has(r.equipamiento)) {
        const eq = {
          id: r.equipment_id,
          equipamiento: r.equipamiento,
          estado: r.estado,
          datos: r.numdoc ? [] : [] 
        };
        eqMap.set(r.equipamiento, eq);
        hierarchy.push(eq);
      }
      
      if (r.numdoc) {
        eqMap.get(r.equipamiento).datos.push({
          numdoc: r.numdoc,
          peso: r.peso
        });
      }
    });

    res.json(hierarchy);
  } catch (err) {
    console.error("Error in GET /step7/results:", err);
    res.status(500).json({ error: "Failed to fetch step 7 results" });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Portic ETL API (Node.js) running on http://localhost:${port}`);
});
