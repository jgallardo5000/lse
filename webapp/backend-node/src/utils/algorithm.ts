
export enum Estado {
  OK = "OK",
  WARN = "WARN",
  KO = "KO"
}

export interface Partida {
  id: string;
  peso: number;
  contenedores: string[];
}

export interface Contenedor {
  id: string;
  peso: number;
  tara: number;
}

export interface ErrorValidacion {
  tipo: string;
  descripcion: string;
}

export interface ResultadoContenedor {
  contenedorId: string;
  pesoBruto: number;
  tara: number;
  pesoNeto: number;
  partidasExclusivas: string[];
  partidasCompartidas: string[];
  pesoExclusivas: number;
  porcionCompartida: number; // For shared use: pesoNeto - pesoExclusivas
  estado: Estado;
  motivo: string;
  grupoContenedores?: string[]; // IDs of all containers in the same group
  grupoPartidas?: string[];     // IDs of all shared partidas in the same group
}

export interface ResultadoValidacion {
  detalle: ResultadoContenedor[];
  errores: ErrorValidacion[];
}

function peorEstado(...estados: (Estado | null)[]): Estado {
  if (estados.includes(Estado.KO)) return Estado.KO;
  return Estado.OK;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Clave única para un conjunto de IDs de contenedores (orden no importa) */
function claveGrupo(ids: string[]): string {
  return [...ids].sort().join("|");
}

/**
 * Valida cada contenedor individualmente usando la lógica de "Paso 5" (Grupos Compartidos).
 * Trabaja con PESO NETO (Bruto - Tara).
 */
export function validar(
  partidas: Partida[],
  contenedores: Contenedor[],
  toleranciaPct: number = 10
): ResultadoValidacion {
  const errores: ErrorValidacion[] = [];

  // Índice de contenedores
  const idxCont = new Map<string, Contenedor>(contenedores.map(c => [c.id, c]));

  // 1. Validar referencias
  for (const p of partidas) {
    if (!p.contenedores.length) {
      errores.push({
        tipo: "SIN_CONTENEDOR",
        descripcion: `Partida ${p.id} sin contenedor asignado`
      });
    }
    for (const cid of p.contenedores) {
      if (!idxCont.has(cid)) {
        errores.push({
          tipo: "CONTENEDOR_INEXISTENTE",
          descripcion: `Partida ${p.id} referencia '${cid}' que no existe`
        });
      }
    }
  }

  // 2. Clasificar partidas: exclusivas vs compartidas
  const compartidas = new Set(
    partidas
      .filter(p => p.contenedores.filter(cid => idxCont.has(cid)).length > 1)
      .map(p => p.id)
  );

  // 3. Mapa contenedor → partidas asignadas
  const partidasDe = new Map<string, Partida[]>(contenedores.map(c => [c.id, []]));
  for (const p of partidas) {
    for (const cid of p.contenedores) {
      if (partidasDe.has(cid)) {
        partidasDe.get(cid)!.push(p);
      }
    }
  }

  // 4. Calcular porción compartida de cada contenedor (usando PESO NETO)
  const porcionCompartida = new Map<string, number>();
  for (const c of contenedores) {
    const asig = partidasDe.get(c.id) || [];
    const pExcl = asig.filter(p => !compartidas.has(p.id));
    const pesoEx = pExcl.reduce((sum, p) => sum + p.peso, 0);
    const pesoNeto = c.peso - c.tara;
    porcionCompartida.set(c.id, pesoNeto - pesoEx);
  }

  // 5. Validar grupos de partidas compartidas
  const grupoEstado = new Map<string, Estado>();
  const grupoContenedoresMap = new Map<string, string[]>();
  const grupoPartidasMap = new Map<string, string[]>();
  const procesados = new Set<string>();

  for (const p of partidas) {
    if (!compartidas.has(p.id)) continue;
    
    const contsValidos = p.contenedores.filter(cid => idxCont.has(cid));
    const clave = claveGrupo(contsValidos);
    if (procesados.has(clave)) continue;
    procesados.add(clave);

    // Todas las partidas compartidas que pertenecen EXACTAMENTE a este grupo de contenedores
    const partidasGrupo = partidas.filter(pp => 
      compartidas.has(pp.id) &&
      claveGrupo(pp.contenedores.filter(cid => idxCont.has(cid))) === clave
    );

    const totalPartidasGrupo = partidasGrupo.reduce((s, pp) => s + pp.peso, 0);
    const sumaPorciones = contsValidos.reduce(
      (s, cid) => s + (porcionCompartida.get(cid) ?? 0), 0
    );

    const diff = Math.abs(totalPartidasGrupo - sumaPorciones);
    const tol = totalPartidasGrupo > 0 ? (totalPartidasGrupo * toleranciaPct) / 100 : 0;

    let estadoG: Estado;
    if (diff === 0) {
      estadoG = Estado.OK;
    } else if (diff <= tol) {
      estadoG = Estado.OK;
      errores.push({
        tipo: "AVISO_GRUPO",
        descripcion: `Grupo [${contsValidos.join(",")}]: diferencia ${round2(diff)} kg dentro de ±${round2(tol)} kg`
      });
    } else {
      estadoG = Estado.KO;
      errores.push({
        tipo: "DESAJUSTE_GRUPO",
        descripcion: `Grupo [${contsValidos.join(",")}]: partidas=${totalPartidasGrupo} kg, porciones=${round2(sumaPorciones)} kg, diferencia ${round2(diff)} kg supera ±${round2(tol)} kg`
      });
    }
    grupoEstado.set(clave, estadoG);
    grupoContenedoresMap.set(clave, contsValidos);
    grupoPartidasMap.set(clave, partidasGrupo.map(pp => pp.id));
  }

  // 6. Estado final por contenedor
  const detalle: ResultadoContenedor[] = [];

  for (const c of contenedores) {
    const asig = partidasDe.get(c.id) || [];
    const pExcl = asig.filter(p => !compartidas.has(p.id));
    const pComp = asig.filter(p => compartidas.has(p.id));
    const pesoEx = pExcl.reduce((s, p) => s + p.peso, 0);
    const pesoNeto = c.peso - c.tara;
    const porcion = porcionCompartida.get(c.id) || 0;

    if (!asig.length) {
      errores.push({ tipo: "CONTENEDOR_VACIO", descripcion: `Contenedor ${c.id} sin partida asignada` });
      detalle.push({
        contenedorId: c.id, pesoBruto: c.peso, tara: c.tara, pesoNeto,
        partidasExclusivas: [], partidasCompartidas: [],
        pesoExclusivas: 0, porcionCompartida: 0,
        estado: Estado.KO, motivo: "sin partida asignada"
      });
      continue;
    }

    const estadosParciales: Estado[] = [];
    const motivos: string[] = [];
    const grupoConts = new Set<string>();
    const grupoParts = new Set<string>();

    // Lógica Exclusivas
    if (pExcl.length) {
      let estadoExcl: Estado;
      if (!pComp.length) {
        // Solo exclusivas: comparación directa
        const diff = Math.abs(pesoNeto - pesoEx);
        const tol = (pesoNeto * toleranciaPct) / 100;
        if (diff === 0) {
          estadoExcl = Estado.OK;
          motivos.push(`excl ${pesoEx} kg exacto`);
        } else if (diff <= tol) {
          estadoExcl = Estado.OK;
          motivos.push(`excl diff ${round2(diff)} kg <= tol`);
        } else {
          estadoExcl = Estado.KO;
          motivos.push(`excl diff ${round2(diff)} kg > tol`);
        }
      } else {
        // Mixto: verificamos que las exclusivas quepan
        estadoExcl = Estado.OK;
        motivos.push(`excl ${pesoEx} kg caben (porción comp=${round2(porcion)} kg)`);
      }
      estadosParciales.push(estadoExcl);
    }

    // Lógica Compartidas
    if (pComp.length) {
      let estadoComp: Estado;
      const clavesGrupo = Array.from(new Set(
        pComp.map(p => claveGrupo(p.contenedores.filter(cid => idxCont.has(cid))))
      ));
      
      for (const k of clavesGrupo) {
        (grupoContenedoresMap.get(k) || []).forEach(cid => grupoConts.add(cid));
        (grupoPartidasMap.get(k) || []).forEach(pid => grupoParts.add(pid));
      }

      estadoComp = peorEstado(...clavesGrupo.map(k => grupoEstado.get(k) || Estado.KO));
      motivos.push(`comp: grupo ${estadoComp}`);
      estadosParciales.push(estadoComp);
    }

    detalle.push({
      contenedorId: c.id,
      pesoBruto: c.peso,
      tara: c.tara,
      pesoNeto,
      partidasExclusivas: pExcl.map(p => p.id),
      partidasCompartidas: pComp.map(p => p.id),
      pesoExclusivas: pesoEx,
      porcionCompartida: round2(porcion),
      estado: peorEstado(...estadosParciales),
      motivo: motivos.join(" | "),
      grupoContenedores: grupoConts.size > 1 ? Array.from(grupoConts) : undefined,
      grupoPartidas: grupoParts.size > 0 ? Array.from(grupoParts) : undefined
    });
  }

  return { detalle, errores };
}
