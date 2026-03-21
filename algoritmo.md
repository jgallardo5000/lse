Viewed lspAlgorithm.js:1-291

¡Claro que sí! Te lo explico de forma sencilla y sin tanto tecnicismo para que quede súper claro.

Imagina que estás organizando una mudanza. Tienes **Cajas** (que en el código se llaman [Partidas](cci:1://file:///Users/jgportic/Development/lsepython/lsp-react/src/utils/lspAlgorithm.js:80:4-88:5) o Cargamentos) y tienes **Furgonetas** (que en el código son los [Contenedores](cci:1://file:///Users/jgportic/Development/lsepython/lsp-react/src/utils/lspAlgorithm.js:90:4-102:5)). 

Cada Furgoneta tiene una capacidad declarada (por ejemplo, "puedo llevar 100 kg") y cada Caja tiene un peso (por ejemplo, "peso 40 kg"). 

El algoritmo sirve para asegurar que **nadie te esté engañando con los pesos**. Quiere comprobar que el peso total de las Cajas cuadre con la capacidad declarada de las Furgonetas que las llevan, permitiendo un pequeño margen de error o "tolerancia" (por ejemplo, aceptar un error del 10% porque las básculas pueden fallar).

El problema principal que resuelve el algoritmo es que **algunas cajas son tan grandes que se tienen que repartir (compartir) entre varias furgonetas**, mientras que otras cajas van en una sola furgoneta (exclusivas).

Aquí están los 6 pasos que sigue el algoritmo para resolver este rompecabezas:

### 1. Pasar lista ([validarReferencias](cci:1://file:///Users/jgportic/Development/lsepython/lsp-react/src/utils/lspAlgorithm.js:63:4-78:5))
Primero comprueba que no haya errores tontos: verifica que ninguna Caja intente meterse en una Furgoneta que no existe, o que haya Cajas que no tengan asignada ninguna Furgoneta.

### 2. Separar lo fácil de lo difícil ([clasificarPartidas](cci:1://file:///Users/jgportic/Development/lsepython/lsp-react/src/utils/lspAlgorithm.js:80:4-88:5))
El algoritmo divide las cajas en dos tipos:
- **Exclusivas**: Cajas que van enteras en una sola furgoneta.
- **Compartidas**: Cajas gigantes que se van a repartir entre 2 o más furgonetas.

### 3. Ver qué lleva cada uno ([mapearContenedoresAPartidas](cci:1://file:///Users/jgportic/Development/lsepython/lsp-react/src/utils/lspAlgorithm.js:90:4-102:5))
Crea una lista para cada Furgoneta anotando todas las cajas que le van a meter (ya sean cajas que lleva ella sola, o cajas que comparte con otros).

### 4. Calcular el "espacio sobrante" ([calcularPorcionesCompartidas](cci:1://file:///Users/jgportic/Development/lsepython/lsp-react/src/utils/lspAlgorithm.js:104:4-117:5))
Aquí viene la magia. Para cada Furgoneta, el algoritmo dice:
*"A ver, dices que aguantas 100 kg. Tienes asignadas unas cajas exclusivas que suman 60 kg. Eso significa que te **sobran 40 kg** para ayudar a cargar las cajas compartidas."*
A este espacio de sobra se le llama **"porción compartida"**.

### 5. Cuadrar a los que trabajan en equipo ([validarGruposCompartidos](cci:1://file:///Users/jgportic/Development/lsepython/lsp-react/src/utils/lspAlgorithm.js:119:4-140:5))
El algoritmo agrupa a las furgonetas que trabajan juntas. Por ejemplo, si la Furgoneta A y B comparten una caja gigante de 100 kg.
El algoritmo suma el "espacio sobrante" de A y B (calculado en el paso anterior). Si la suma de sus espacios sobrantes es igual a los 100 kg de la caja (con un margen de tolerancia), entonces ese "grupo de furgonetas" recibe un **OK**. Si bailan un poco los números pero está dentro del margen de error, les pone un aviso (**WARN**). Si los números no tienen sentido por mucho, suspenden (**KO**).

### 6. Poner las notas finales ([calcularEstadoPorContenedor](cci:1://file:///Users/jgportic/Development/lsepython/lsp-react/src/utils/lspAlgorithm.js:179:4-187:5))
Por último, el algoritmo le da una nota a cada furgoneta:
- Si la furgoneta **solo lleva cajas exclusivas**, comprueba que sumen exactamente su capacidad (dentro de la tolerancia). Si cuadra, **OK**, si se pasa o no llega, **KO/WARN**.
- Si la furgoneta **lleva cajas compartidas**, asume la nota del "grupo" del paso 5. Es un trabajo en equipo, así que si el grupo falló (**KO**), la furgoneta también reprueba.

### Resumen
El algoritmo lo que hace es: "Lleno cada furgoneta con sus cajas exclusivas, veo cuánto espacio les sobra, y luego sumo esos 'espacios sobrantes' de todas las furgonetas que comparten cajas para ver si entre todas son capaces de cargar con ese peso compartido".

¿Te queda más claro visto de esta manera?



/**
 * Algoritmo de control de salida de contenedores - Puerto LSP
 * ============================================================
 *
 * Lógica LSP — contenedor a contenedor (v8)
 *
 * El peso declarado del contenedor es su peso TOTAL.
 * Un contenedor puede tener partidas exclusivas Y compartidas.
 *
 * CASO A — Partida EXCLUSIVA (1 contenedor):
 *   peso_cont = Σ exclusivas → validación individual OK/WARN/KO
 *
 * CASO B — Partida COMPARTIDA (N contenedores):
 *   porción_compartida = peso_cont − Σ exclusivas
 *   Se valida el GRUPO:
 *     Σ porciones de todos los contenedores del grupo
 *     == Σ pesos de las partidas compartidas del grupo
 *
 * CASO C — Sin partida asignada → KO
 *
 * Si exclusivas > peso_contenedor → KO
 * Estado final = peor entre exclusivas y grupo compartido
 */

"use strict";

// ── Tipos / constantes ───────────────────────────────────────────────────────

const Estado = Object.freeze({ OK: "OK", WARN: "WARN", KO: "KO" });

/**
 * @typedef {Object} Partida
 * @property {string}   id
 * @property {number}   peso
 * @property {string[]} contenedores  - IDs de los contenedores donde va
 */

/**
 * @typedef {Object} Contenedor
 * @property {string} id
 * @property {number} peso
 */

/**
 * @typedef {Object} ErrorValidacion
 * @property {string} tipo
 * @property {string} descripcion
 */

/**
 * @typedef {Object} ResultadoContenedor
 * @property {string}   contenedorId
 * @property {number}   pesoDeclarado
 * @property {string[]} partidasExclusivas
 * @property {string[]} partidasCompartidas
 * @property {number}   pesoExclusivas
 * @property {number}   porcionCompartida     - pesoDeclarado − pesoExclusivas
 * @property {string}   estado                - "OK" | "WARN" | "KO"
 * @property {string}   motivo
 */

/**
 * @typedef {Object} ResultadoValidacion
 * @property {ResultadoContenedor[]} detalle
 * @property {ErrorValidacion[]}     errores
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function peorEstado(...estados) {
    if (estados.includes(Estado.KO)) return Estado.KO;
    if (estados.includes(Estado.WARN)) return Estado.WARN;
    return Estado.OK;
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

/** Clave única para un conjunto de IDs de contenedores (orden no importa) */
function claveGrupo(ids) {
    return [...ids].sort().join("|");
}

// ── Algoritmo principal ───────────────────────────────────────────────────────

/**
 * Valida cada contenedor individualmente.
 *
 * @param {Partida[]}    partidas
 * @param {Contenedor[]} contenedores
 * @param {number}       toleranciaPct  - margen en % sobre el peso (default 10)
 * @returns {ResultadoValidacion}
 */
function validar(partidas, contenedores, toleranciaPct = 10) {

    const errores = [];

    // Índice de contenedores
    const idxCont = new Map(contenedores.map(c => [c.id, c]));

    // ── Validar referencias ────────────────────────────────────────────────────
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

    // ── Clasificar partidas: exclusivas vs compartidas ─────────────────────────
    const compartidas = new Set(
        partidas
            .filter(p => p.contenedores.filter(c => idxCont.has(c)).length > 1)
            .map(p => p.id)
    );

    // ── Mapa contenedor → partidas asignadas ──────────────────────────────────
    const partidasDe = new Map(contenedores.map(c => [c.id, []]));
    for (const p of partidas) {
        for (const cid of p.contenedores) {
            if (partidasDe.has(cid)) partidasDe.get(cid).push(p);
        }
    }

    // ── Calcular porción compartida de cada contenedor ────────────────────────
    const porcionCompartida = new Map();
    for (const c of contenedores) {
        const asig = partidasDe.get(c.id);
        const excl = asig.filter(p => !compartidas.has(p.id));
        const pesoEx = excl.reduce((s, p) => s + p.peso, 0);
        porcionCompartida.set(c.id, c.peso - pesoEx);
    }

    // ── Validar grupos de partidas compartidas ────────────────────────────────
    const grupoEstado = new Map();  // clave → Estado
    const procesados = new Set();

    for (const p of partidas) {
        if (!compartidas.has(p.id)) continue;
        const contsValidos = p.contenedores.filter(c => idxCont.has(c));
        const clave = claveGrupo(contsValidos);
        if (procesados.has(clave)) continue;
        procesados.add(clave);

        const contsSet = new Set(contsValidos);

        // Todas las partidas compartidas de exactamente este grupo
        const partidasGrupo = partidas.filter(pp =>
            compartidas.has(pp.id) &&
            claveGrupo(pp.contenedores.filter(c => idxCont.has(c))) === clave
        );

        const totalPartidasGrupo = partidasGrupo.reduce((s, pp) => s + pp.peso, 0);
        const sumaPorciones = contsValidos.reduce(
            (s, cid) => s + (porcionCompartida.get(cid) ?? 0), 0
        );

        const diff = Math.abs(totalPartidasGrupo - sumaPorciones);
        const tol = totalPartidasGrupo > 0
            ? totalPartidasGrupo * toleranciaPct / 100
            : 0;

        let estadoG;
        if (sumaPorciones < 0) {
            estadoG = Estado.KO;
            errores.push({
                tipo: "PORCION_NEGATIVA",
                descripcion: `Grupo [${[...contsSet].join(",")}]: algún contenedor tiene exclusivas > peso total`
            });
        } else if (diff === 0) {
            estadoG = Estado.OK;
        } else if (diff <= tol) {
            estadoG = Estado.WARN;
            errores.push({
                tipo: "AVISO_GRUPO",
                descripcion: `Grupo [${[...contsSet].join(",")}]: diferencia ${round2(diff)} kg dentro de ±${round2(tol)} kg (${toleranciaPct}%)`
            });
        } else {
            estadoG = Estado.KO;
            errores.push({
                tipo: "DESAJUSTE_GRUPO",
                descripcion: `Grupo [${[...contsSet].join(",")}]: partidas=${totalPartidasGrupo} kg, porciones=${round2(sumaPorciones)} kg, diferencia ${round2(diff)} kg supera ±${round2(tol)} kg`
            });
        }

        grupoEstado.set(clave, estadoG);
    }

    // ── Estado por contenedor ─────────────────────────────────────────────────
    const detalle = [];

    for (const c of contenedores) {
        const asig = partidasDe.get(c.id);
        const pExcl = asig.filter(p => !compartidas.has(p.id));
        const pComp = asig.filter(p => compartidas.has(p.id));
        const pesoEx = pExcl.reduce((s, p) => s + p.peso, 0);
        const porcion = porcionCompartida.get(c.id);

        // Sin partida
        if (!asig.length) {
            errores.push({
                tipo: "CONTENEDOR_VACÍO",
                descripcion: `Contenedor ${c.id} sin partida asignada`
            });
            detalle.push({
                contenedorId: c.id, pesoDeclarado: c.peso,
                partidasExclusivas: [], partidasCompartidas: [],
                pesoExclusivas: 0, porcionCompartida: 0,
                estado: Estado.KO, motivo: "sin partida asignada"
            });
            continue;
        }

        const estadosParciales = [];
        const motivos = [];

        // CASO A: exclusivas
        let estadoExcl = null;
        if (pExcl.length) {
            if (pesoEx > c.peso) {
                estadoExcl = Estado.KO;
                motivos.push(`exclusivas ${pesoEx} kg > contenedor ${c.peso} kg`);
            } else if (!pComp.length) {
                // Solo exclusivas: comparación directa
                const diff = Math.abs(c.peso - pesoEx);
                const tolAbs = c.peso * toleranciaPct / 100;
                if (diff === 0) {
                    estadoExcl = Estado.OK;
                    motivos.push(`exclusivas: ${pesoEx} kg exacto`);
                } else if (diff <= tolAbs) {
                    estadoExcl = Estado.WARN;
                    motivos.push(`exclusivas: diff ${round2(diff)} kg ≤ ±${round2(tolAbs)} kg`);
                } else {
                    estadoExcl = Estado.KO;
                    motivos.push(`exclusivas: diff ${round2(diff)} kg > ±${round2(tolAbs)} kg`);
                }
            } else {
                // Mixto: las exclusivas caben
                estadoExcl = Estado.OK;
                motivos.push(`exclusivas: ${pesoEx} kg caben (porción compartida=${round2(porcion)} kg)`);
            }
            estadosParciales.push(estadoExcl);
        }

        // CASO B: compartidas → estado del grupo
        if (pComp.length) {
            let estadoComp;
            if (porcion < 0) {
                estadoComp = Estado.KO;
                motivos.push(`porción compartida negativa (${round2(porcion)} kg)`);
            } else {
                const clavesGrupo = new Set(
                    pComp.map(p => claveGrupo(p.contenedores.filter(c2 => idxCont.has(c2))))
                );
                estadoComp = peorEstado(
                    ...[...clavesGrupo].map(k => grupoEstado.get(k) ?? Estado.KO)
                );
                motivos.push(`compartidas: grupo ${estadoComp}`);
            }
            estadosParciales.push(estadoComp);
        }

        detalle.push({
            contenedorId: c.id,
            pesoDeclarado: c.peso,
            partidasExclusivas: pExcl.map(p => p.id),
            partidasCompartidas: pComp.map(p => p.id),
            pesoExclusivas: pesoEx,
            porcionCompartida: round2(porcion),
            estado: peorEstado(...estadosParciales),
            motivo: motivos.join(" | ")
        });
    }

    return { detalle, errores };
}

// ── Utilidad: imprimir resultado ──────────────────────────────────────────────

function imprimirResultado(resultado) {
    const sep = "─".repeat(72);
    console.log(sep);
    for (const d of resultado.detalle) {
        const excl = d.partidasExclusivas.join(", ") || "—";
        const comp = d.partidasCompartidas.join(", ") || "—";
        console.log(
            `  ${d.contenedorId.padEnd(6)}  ${String(d.pesoDeclarado).padStart(7)} kg` +
            `  excl=[${excl}](${d.pesoExclusivas}kg)` +
            `  comp=[${comp}](porción=${d.porcionCompartida}kg)` +
            `  → ${d.estado.padEnd(4)}  (${d.motivo})`
        );
    }
    if (resultado.errores.length) {
        console.log("\n  Errores / avisos:");
        for (const e of resultado.errores) {
            console.log(`    [${e.tipo}] ${e.descripcion}`);
        }
    }
    console.log(sep);
}

// ── Escenarios de prueba ──────────────────────────────────────────────────────

const ESCENARIOS = [
    {
        nombre: "Esc.1 — exclusiva 1→1 OK",
        partidas: [{ id: "P1", peso: 100, contenedores: ["C1"] }],
        contenedores: [{ id: "C1", peso: 100 }],
    },
    {
        nombre: "Esc.2 — exclusiva 1→1 KO",
        partidas: [{ id: "P2", peso: 150, contenedores: ["C2"] }],
        contenedores: [{ id: "C2", peso: 160 }],
    },
    {
        nombre: "Esc.3 — compartida grupo OK",
        partidas: [{ id: "P3", peso: 200, contenedores: ["C3", "C4"] }],
        contenedores: [{ id: "C3", peso: 100 }, { id: "C4", peso: 100 }],
    },
    {
        nombre: "Esc.4 — compartida grupo KO",
        partidas: [{ id: "P3", peso: 200, contenedores: ["C3", "C4"] }],
        contenedores: [{ id: "C3", peso: 100 }, { id: "C4", peso: 200 }],
    },
    {
        nombre: "Esc.5 — N partidas mismo grupo → OK",
        partidas: [
            { id: "P1", peso: 100, contenedores: ["C1", "C2", "C3"] },
            { id: "P2", peso: 200, contenedores: ["C1", "C2", "C3"] },
        ],
        contenedores: [{ id: "C1", peso: 100 }, { id: "C2", peso: 100 }, { id: "C3", peso: 100 }],
    },
    {
        nombre: "Esc.6 — Mixto: exclusivas + compartidas, grupo KO",
        desc: "C1(50kg): P5(excl,50kg)+porción P1,P2=0kg. Grupo C1;C2: 0+150=150≠200kg.",
        partidas: [
            { id: "P1", peso: 100, contenedores: ["C1", "C2"] },
            { id: "P2", peso: 100, contenedores: ["C1", "C2"] },
            { id: "P3", peso: 100, contenedores: ["C3"] },
            { id: "P4", peso: 200, contenedores: ["C4", "C5"] },
            { id: "P5", peso: 50, contenedores: ["C1"] },
        ],
        contenedores: [
            { id: "C1", peso: 50 }, { id: "C2", peso: 150 },
            { id: "C3", peso: 100 }, { id: "C4", peso: 100 }, { id: "C5", peso: 100 },
        ],
    },
    {
        nombre: "Esc.7 — Mixto: exclusivas + compartidas, grupo OK",
        desc: "C1(250kg): P5(excl,50kg)+porción P1,P2=200kg. Grupo C1;C2: 200+0=200=P1+P2.",
        partidas: [
            { id: "P1", peso: 100, contenedores: ["C1", "C2"] },
            { id: "P2", peso: 100, contenedores: ["C1", "C2"] },
            { id: "P5", peso: 50, contenedores: ["C1"] },
        ],
        contenedores: [{ id: "C1", peso: 250 }, { id: "C2", peso: 0 }],
    },
    {
        nombre: "Esc.8 — C4 exclusivo OK / compartidas grupos KO",
        partidas: [
            { id: "P1", peso: 100, contenedores: ["C4"] },
            { id: "P2", peso: 50, contenedores: ["C1", "C2"] },
            { id: "P3", peso: 80, contenedores: ["C3", "C1"] },
        ],
        contenedores: [
            { id: "C1", peso: 80 }, { id: "C2", peso: 30 },
            { id: "C3", peso: 70 }, { id: "C4", peso: 100 },
        ],
    },
];

// ── Main ──────────────────────────────────────────────────────────────────────

for (const esc of ESCENARIOS) {
    console.log(`\n${esc.nombre}`);
    if (esc.desc) console.log(`  ${esc.desc}`);
    const resultado = validar(esc.partidas, esc.contenedores, 10);
    imprimirResultado(resultado);
}

// ── Exportar para uso como módulo ─────────────────────────────────────────────

if (typeof module !== "undefined") {
    module.exports = { validar, Estado };
}


