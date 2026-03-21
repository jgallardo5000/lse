#!/usr/bin/env python3
"""
portic_etl.py
=============
ETL: Oracle (PORTIC) → PostgreSQL (LSE)

Proceso en 3 pasos:
  1. Listar mensajes COPRAR recientes y elegir ID_INTERNO + PORT_CALL_NUMBER
  2. Cargar equipamientos de ese mensaje en equipamientos_escala
  3. Para cada equipamiento, cargar partidas/eventos en partidas_equipamiento
"""

import sys
import logging
from datetime import datetime
from tabulate import tabulate
from psycopg2.extras import execute_values

# ── Conexión Oracle ────────────────────────────────────────────────────────────
ORACLE_CONFIG = {
    "host":        "orap01-vip.portic.net",
    "port":        1521,
    "service":     "portic",
    "username":    "consulta",
    "password":    "52.Vival",
}

# ── Conexión PostgreSQL ────────────────────────────────────────────────────────
PG_CONFIG = {
    "host":     "localhost",
    "port":     5432,
    "database": "lse",
    "user":     "postgres",
    "password": "",          # ajusta si tienes contraseña local
}

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(f"portic_etl_{datetime.now():%Y%m%d_%H%M%S}.log"),
    ],
)
log = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS DE CONEXIÓN
# ══════════════════════════════════════════════════════════════════════════════

def get_oracle_connection():
    """Devuelve una conexión oracledb activa (Thin mode)."""
    try:
        import oracledb
    except ImportError:
        log.error("Falta el paquete oracledb.  Instálalo con:  pip install oracledb")
        sys.exit(1)

    try:
        # En oracledb (Thin mode), no se necesita makedsn si usamos el formato host:port/service
        conn = oracledb.connect(
            user=ORACLE_CONFIG["username"],
            password=ORACLE_CONFIG["password"],
            host=ORACLE_CONFIG["host"],
            port=ORACLE_CONFIG["port"],
            service_name=ORACLE_CONFIG["service"]
        )
        log.info("Conexión Oracle (Thin mode) establecida correctamente.")
        return conn
    except oracledb.DatabaseError as e:
        log.error(f"Error conectando a Oracle: {e}")
        sys.exit(1)


def get_pg_connection():
    """Devuelve una conexión psycopg2 activa."""
    try:
        import psycopg2
    except ImportError:
        log.error("Falta el paquete psycopg2.  Instálalo con:  pip install psycopg2-binary")
        sys.exit(1)

    try:
        conn = psycopg2.connect(**PG_CONFIG)
        log.info("Conexión PostgreSQL establecida correctamente.")
        return conn
    except Exception as e:
        log.error(f"Error conectando a PostgreSQL: {e}")
        sys.exit(1)


# ══════════════════════════════════════════════════════════════════════════════
# PASO 1 — Listar mensajes COPRAR recientes
# ══════════════════════════════════════════════════════════════════════════════

def paso1_listar_mensajes(ora_conn) -> list[dict]:
    """
    Recupera los últimos mensajes COPRAR (máx. 10, último día).
    Muestra los resultados en tabla y devuelve la lista.
    """
    sql = """
        SELECT cm.ID_INTERNO,
               cm.MESSAGE_DATE,
               cm.PORT_CALL_NUMBER,
               CM.NUM_CONTENEDORES
        FROM   PORTIC.COPRAR_MENSAJES cm
        WHERE  cm.RECEIVER_UNB       = 'ESQ0817002I'
          AND  cm.CONTAINER_LIST_TYPE = '121'
          AND  cm.CONTAINER_LIST_TARGET = 'COPORD'
          AND  cm.ESTADO              = 'OKSI'
          AND  cm.MESSAGE_DATE        > SYSDATE - 1
          AND  ROWNUM                 < 10
    """
    log.info("PASO 1 — Consultando mensajes COPRAR en Oracle…")
    cursor = ora_conn.cursor()
    cursor.execute(sql)
    cols = [d[0] for d in cursor.description]
    rows = cursor.fetchall()
    cursor.close()

    if not rows:
        log.warning("No se encontraron mensajes COPRAR en las últimas 24 horas.")
        return []

    data = [dict(zip(cols, r)) for r in rows]

    print("\n" + "═" * 70)
    print("  PASO 1 — Mensajes COPRAR recientes")
    print("═" * 70)
    print(tabulate(rows, headers=cols, tablefmt="pretty"))
    print()

    return data


# ══════════════════════════════════════════════════════════════════════════════
# PASO 2 — Cargar equipamientos en PostgreSQL
# ══════════════════════════════════════════════════════════════════════════════

def paso2_cargar_equipamientos(ora_conn, pg_conn, id_interno: int,
                                port_call_number: str, max_registros: int):
    """
    1. Consulta equipamientos en Oracle para el ID_INTERNO dado.
    2. Borra los registros previos de la escala en Postgres.
    3. Inserta equipamientos nuevos.
    4. Actualiza el campo tara desde la tabla taras.
    """
    # ── 2a. Consulta Oracle ────────────────────────────────────────────────
    sql_ora = f"""
        SELECT ce.EQUIPMENT_ID_NUMBER,
               ce.EQUIPMENT_TYPE,
               ce.VGM_PESO_VERIFICADO
        FROM   PORTIC.COPRAR_EQUIPAMIENTOS ce
        WHERE  ce.ID_INTERNO             = :id_interno
          AND  CE.FULL_EMPTY_INDICATOR   = 5
          AND  CE.VGM_PESO_VERIFICADO    IS NOT NULL
          AND  ROWNUM                   <= :max_reg
    """
    log.info(f"PASO 2 — Consultando equipamientos para ID_INTERNO={id_interno}…")
    cur_ora = ora_conn.cursor()
    cur_ora.execute(sql_ora, id_interno=id_interno, max_reg=max_registros)
    cols = [d[0] for d in cur_ora.description]
    rows = cur_ora.fetchall()
    cur_ora.close()

    if not rows:
        log.warning(f"No se encontraron equipamientos para ID_INTERNO={id_interno}.")
        return

    log.info(f"  → {len(rows)} equipamientos recuperados de Oracle.")

    # ── 2b. Borrar registros previos de la escala en Postgres ──────────────
    cur_pg = pg_conn.cursor()
    cur_pg.execute(
        "DELETE FROM equipamientos_escala WHERE escala = %s",
        (port_call_number,)
    )
    deleted = cur_pg.rowcount
    log.info(f"  → DELETE equipamientos_escala WHERE escala={port_call_number}: "
             f"{deleted} filas eliminadas.")

    # ── 2c. Insertar equipamientos nuevos ──────────────────────────────────
    insert_sql = """
        INSERT INTO equipamientos_escala
            (id_lista, escala, equipamiento, tipo, peso, tara)
        VALUES (%s, %s, %s, %s, %s, NULL)
        RETURNING id
    """
    for row in rows:
        equip = dict(zip(cols, row))
        cur_pg.execute(insert_sql, (
            id_interno,                                # id_lista — no disponible en la query
            port_call_number,                    # escala
            equip["EQUIPMENT_ID_NUMBER"],
            equip["EQUIPMENT_TYPE"],
            equip["VGM_PESO_VERIFICADO"],
        ))

        log.info( "equipamientos insertados en equipamientos_escala.")

        # ── 2d. Actualizar tara desde la tabla taras ───────────────────────────
        update_sql = """
            UPDATE equipamientos_escala ee
            SET    tara = t.peso
            FROM   taras t
            WHERE  ee.equipamiento = %s
              AND  t.tipo    = ee.tipo
    """
        cur_pg.execute(update_sql, (equip["EQUIPMENT_ID_NUMBER"],))
        updated = cur_pg.rowcount
        log.info(f"  → {updated} filas actualizadas con tara desde tabla taras.")

    pg_conn.commit()
    cur_pg.close()
    log.info("PASO 2 completado y cambios confirmados en PostgreSQL.")


# ══════════════════════════════════════════════════════════════════════════════
# PASO 3 — Cargar partidas/eventos por equipamiento
# ══════════════════════════════════════════════════════════════════════════════

SQL_PARTIDAS = """
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
    WHERE  te.ID_EQUIPAMIENTO      IN ({placeholders})
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
"""

INSERT_PARTIDA = """
    INSERT INTO partidas_equipamiento
        (fecha_alta, id_documento_partida, peso, tipo_documento,
         fecha_evento, nombre_evento, equipamiento,idlista,escala)
    VALUES %s
"""


def paso3_cargar_partidas(ora_conn, pg_conn, id_lista: int, port_call_number: str):
    """
    Borra los equipameintos_a partidass
    """
    log.info(f"PASO 3 — borra partidas para escala={port_call_number}…")

    # Recuperar equipamientos de la escala
    cur_pg = pg_conn.cursor()


    cur_pg.execute(
        "DELETE FROM partidas_equipamiento WHERE idlista = %s",
        (id_lista,)
    )
    
    deleted = cur_pg.rowcount
    log.info(f"  → DELETE partidas_equipamiento WHERE idlista={id_lista}: "
             f"{deleted} filas eliminadas.")
    pg_conn.commit()
    
    """
    Recupera todos los equipamientos de la escala en Postgres
    y carga sus partidas/eventos desde Oracle en bloques para optimizar.
    """
    log.info(f"PASO 3 — Cargando partidas para escala={port_call_number}…")

    cur_pg.execute(
        "SELECT equipamiento FROM equipamientos_escala WHERE escala = %s",
        (port_call_number,)
    )
    equipamientos = [r[0] for r in cur_pg.fetchall()]

    if not equipamientos:
        log.warning("No hay equipamientos en equipamientos_escala para esta escala.")
        cur_pg.close()
        return

    log.info(f"  → {len(equipamientos)} equipamientos a procesar.")

    cur_ora = ora_conn.cursor()
    total_insertados = 0
    
    # Oracle tiene un límite de 1000 elementos en el IN clause.
    # Procesamos en bloques de 500 por seguridad.
    CHUNK_SIZE = 500
    for i in range(0, len(equipamientos), CHUNK_SIZE):
        chunk = equipamientos[i : i + CHUNK_SIZE]
        
        # Generar marcadores :1, :2, :3... para Oracle
        placeholders = ", ".join([f":{j+1}" for j in range(len(chunk))])
        sql_final = SQL_PARTIDAS.format(placeholders=placeholders)
        
        log.info(f"  → Consultando bloque de {len(chunk)} equipamientos en Oracle…")
        cur_ora.execute(sql_final, chunk)
        
        cols = [d[0] for d in cur_ora.description]
        rows = cur_ora.fetchall()

        if not rows:
            log.warning(f"  [AVISO] Sin partidas encontradas en este bloque.")
            continue

        log.info(f"  ✓ Recibidas {len(rows)} partidas de Oracle. Insertando en Postgres…")
        
        data_to_insert = []
        for row in rows:
            r = dict(zip(cols, row))
            id_doc_partida = f"{r['NUM_DOC']}-{r['NUM_PAR']}"
            data_to_insert.append((
                r["FECHA_ALTA"],
                id_doc_partida,
                r["PESO_B"],
                r["TIPO"],
                r["FECHA_EVENTO"],
                r["NOMBRE_EVENTO"],
                r["ID_EQUIPAMIENTO"],
                id_lista,
                int(port_call_number)
            ))

        # Inserción masiva en Postgres
        execute_values(cur_pg, INSERT_PARTIDA, data_to_insert)
        total_insertados += len(data_to_insert)

    cur_ora.close()
    pg_conn.commit()
    cur_pg.close()

    log.info(f"PASO 3 completado. Total partidas insertadas: {total_insertados}")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN — Flujo interactivo por consola
# ══════════════════════════════════════════════════════════════════════════════

def pedir_entero(prompt: str, minimo: int = 1) -> int:
    while True:
        try:
            valor = int(input(prompt).strip())
            if valor >= minimo:
                return valor
            print(f"  Debe ser >= {minimo}. Inténtalo de nuevo.")
        except ValueError:
            print("  Valor inválido. Introduce un número entero.")


def pedir_valor(prompt: str, opciones: list[str] | None = None) -> str:
    while True:
        valor = input(prompt).strip()
        if not valor:
            print("  El valor no puede estar vacío.")
            continue
        if opciones and valor not in opciones:
            print(f"  Opciones válidas: {opciones}")
            continue
        return valor


def main():
    print("\n" + "═" * 70)
    print("  PORTIC ETL  —  Oracle → PostgreSQL")
    print("═" * 70 + "\n")

    # Abrir conexiones
    ora_conn = get_oracle_connection()
    pg_conn  = get_pg_connection()

    try:
        # ── PASO 1 ────────────────────────────────────────────────────────
        mensajes = paso1_listar_mensajes(ora_conn)

        if not mensajes:
            log.warning("Sin mensajes disponibles. Proceso finalizado.")
            return

        ids_disponibles    = [str(m["ID_INTERNO"])      for m in mensajes]
        pcn_por_id         = {str(m["ID_INTERNO"]): str(m["PORT_CALL_NUMBER"])
                               for m in mensajes}

        # ── PASO 2 — Solicitar parámetros ─────────────────────────────────
        print("─" * 70)
        print("  PASO 2 — Selecciona los parámetros de carga")
        print("─" * 70)

        id_interno = pedir_valor(
            f"  ID_INTERNO a utilizar {ids_disponibles}: ",
            opciones=ids_disponibles,
        )

        port_call_number_sugerido = pcn_por_id[id_interno]
        print(f"  PORT_CALL_NUMBER asociado: {port_call_number_sugerido}")
        port_call_number = pedir_valor(
            f"  Confirma PORT_CALL_NUMBER [{port_call_number_sugerido}]"
            f"  (Enter para aceptar): "
        ) or port_call_number_sugerido
        # Si el usuario pulsa Enter sin escribir nada pedir_valor falla → ajuste:
        raw_pcn = input(
            f"  PORT_CALL_NUMBER [{port_call_number_sugerido}] (Enter para aceptar): "
        ).strip()
        port_call_number = raw_pcn if raw_pcn else port_call_number_sugerido

        max_registros = pedir_entero(
            "  ¿Cuántos registros de equipamientos quieres cargar? (mín. 1): "
        )

        paso2_cargar_equipamientos(
            ora_conn, pg_conn,
            int(id_interno), port_call_number, max_registros,
        )

        # ── PASO 3 ─────────────────────────────────────────────────────────
        print("\n" + "─" * 70)
        print("  PASO 3 — Cargando partidas y eventos")
        print("─" * 70)
        paso3_cargar_partidas(ora_conn, pg_conn, int(id_interno), port_call_number)

        print("\n" + "═" * 70)
        print("  PROCESO COMPLETADO CORRECTAMENTE")
        print("═" * 70 + "\n")

    except KeyboardInterrupt:
        print("\n\n  Proceso interrumpido por el usuario.")
        pg_conn.rollback()

    except Exception as e:
        log.error(f"Error inesperado: {e}", exc_info=True)
        pg_conn.rollback()

    finally:
        ora_conn.close()
        pg_conn.close()
        log.info("Conexiones cerradas.")


if __name__ == "__main__":
    main()