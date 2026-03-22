import React, { useState, useEffect, useMemo } from 'react';

interface Message {
  ID_INTERNO: number;
  MESSAGE_DATE: string;
  PORT_CALL_NUMBER: string;
  NUM_CONTENEDORES: number | null;
}

interface EquipmentResult {
  id: number;
  equipamiento: string;
  tipo: string;
  peso: number;
  tara: number | null;
}

interface PartidaResult {
  id: number;
  id_documento_partida: string;
  peso: number;
  tipo_documento: string;
  fecha_evento: string;
  nombre_evento: string;
  equipamiento: string;
}

interface Step7Data {
  id: number;
  equipamiento: string;
  estado: string;
  datos: {
    numdoc: string;
    peso: number;
  }[];
}

const API_BASE = 'http://localhost:8000';

function App() {
  const [step, setStep] = useState(1);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [maxReg, setMaxReg] = useState(10);
  const [pcn, setPcn] = useState('');
  const [status, setStatus] = useState<{type: string, message: string} | null>(null);
  const [resEquipments, setResEquipments] = useState<EquipmentResult[]>([]);
  const [resPartidas, setResPartidas] = useState<PartidaResult[]>([]);
  const [validationDetail, setValidationDetail] = useState<any[]>([]);
  const [activeResultsTab, setActiveResultsTab] = useState<'step4' | 'step5'>('step5');
  const [step7Data, setStep7Data] = useState<Step7Data[]>([]);
  const [selectedCompareId, setSelectedCompareId] = useState<string | null>(null);
  const [escalaSearch, setEscalaSearch] = useState('');

  const stats = useMemo(() => {
    let s5OK = 0;
    let s5KO = 0;
    validationDetail.forEach(d => {
      if (d.estado === 'OK' || d.estado === 'WARN') s5OK++;
      else s5KO++;
    });

    let s4OK = 0;
    let s4KO = 0;
    resEquipments.forEach(eq => {
      const myPartidas = resPartidas.filter(p => p.equipamiento === eq.equipamiento);
      const uniqueMap: Record<string, any> = {};
      myPartidas.forEach(p => {
        const ex = uniqueMap[p.id_documento_partida];
        if (!ex || new Date(p.fecha_evento) > new Date(ex.fecha_evento)) uniqueMap[p.id_documento_partida] = p;
      });
      const sumPartidas = Object.values(uniqueMap).reduce((acc: number, p: any) => acc + (p.peso || 0), 0);
      const netWeight = (eq.peso || 0) - (eq.tara || 0);
      if (Math.abs(netWeight - sumPartidas) <= (netWeight * 0.1)) s4OK++;
      else s4KO++;
    });
 
    let s7OK = 0;
    let s7KO = 0;
    step7Data.forEach(eq => {
      if (eq.estado === 'OK') s7OK++;
      else s7KO++;
    });

    return { s5OK, s5KO, s4OK, s4KO, s7OK, s7KO };
  }, [validationDetail, resEquipments, resPartidas, step7Data]);

  const comparisonData = useMemo(() => {
    // Collect all unique containers from all sources
    const allContainers = new Set<string>();
    resEquipments.forEach(eq => allContainers.add(eq.equipamiento));
    validationDetail.forEach(d => allContainers.add(d.contenedorId));
    step7Data.forEach(eq => allContainers.add(eq.equipamiento));

    return Array.from(allContainers).sort().map(id => {
      // Step 4 (Basic) Status
      const eq4 = resEquipments.find(e => e.equipamiento === id);
      const myPartidas = resPartidas.filter(p => p.equipamiento === id);
      const uniqueMap: Record<string, any> = {};
      myPartidas.forEach(p => {
        const ex = uniqueMap[p.id_documento_partida];
        if (!ex || new Date(p.fecha_evento) > new Date(ex.fecha_evento)) uniqueMap[p.id_documento_partida] = p;
      });
      const sumPartidas = Object.values(uniqueMap).reduce((acc: number, p: any) => acc + (p.weight || p.peso || 0), 0);
      const netWeight = eq4 ? (eq4.peso || 0) - (eq4.tara || 0) : 0;
      const s4Status = eq4 ? (Math.abs(netWeight - sumPartidas) <= (netWeight * 0.1) ? 'OK' : 'KO') : 'N/A';

      // Step 5 (Advanced) Status
      const eq5 = validationDetail.find(d => d.contenedorId === id);
      const s5Status = eq5 ? eq5.estado : 'N/A';

      // Step 7 (LSP) Status
      const eq7 = step7Data.find(e => e.equipamiento === id);
      const s7Status = eq7 ? eq7.estado : 'N/A';

      return {
        id,
        s4Status,
        s5Status,
        s7Status
      };
    });
  }, [resEquipments, validationDetail, step7Data, resPartidas]);

  useEffect(() => {
    if (selectedCompareId) {
      document.getElementById('comparison-detail')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedCompareId]);

  // Automatically fetch messages on mount? User says NO, wait for input.
  // useEffect(() => {
  //   if (step === 1 && !escalaSearch) {
  //     fetchMessages();
  //   }
  // }, [step]);

  const fetchMessages = async (escala?: string) => {
    if (!escala) {
      setStatus({ type: 'error', message: 'Please enter a Scale Number to search.' });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const url = escala ? `${API_BASE}/messages?escala=${escala}` : `${API_BASE}/messages`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Backend error');
      const data = await res.json();
      setMessages(data);
      if (escala && data.length === 0) {
        setStatus({ type: 'info', message: `No messages found for scale ${escala}` });
      }
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Unable to reach backend or Oracle. Please ensure servers are running.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (msg: Message) => {
    setSelectedId(msg.ID_INTERNO);
    setPcn(msg.PORT_CALL_NUMBER);
    if (msg.NUM_CONTENEDORES) {
      setMaxReg(msg.NUM_CONTENEDORES);
    }
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !pcn) return;

    setLoading(true);
    setStatus({ type: 'info', message: 'Processing Step 2: Loading Equipments...' });

    try {
      const res = await fetch(`${API_BASE}/load-equipments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_interno: selectedId,
          port_call_number: pcn,
          max_registros: maxReg
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setStatus({ type: 'success', message: `Successfully loaded ${data.count} equipments.` });
        setTimeout(() => setStep(3), 1500);
      } else {
        setStatus({ type: 'error', message: data.message });
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'Error communicating with backend.' });
    } finally {
      setLoading(false);
    }
  };

  const handleStep3Run = async () => {
    setLoading(true);
    setStatus({ type: 'info', message: 'Processing Step 3: Loading Partidas & Events...' });

    try {
      const res = await fetch(`${API_BASE}/load-partidas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id_interno: selectedId,
          port_call_number: pcn 
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setStatus({ type: 'success', message: `ETL Completed! ${data.count} partidas processed.` });
        setTimeout(() => {
          setStep(4);
          fetchResults();
        }, 1500);
      } else {
        setStatus({ type: 'error', message: data.message });
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'Error communicating with backend.' });
    } finally {
      setLoading(false);
    }
  };

  const fetchResults = async () => {
    if (!selectedId || !pcn) return;
    setLoading(true);
    try {
      const [eRes, pRes, vRes] = await Promise.all([
        fetch(`${API_BASE}/results/equipments?escala=${pcn}`),
        fetch(`${API_BASE}/results/partidas?idlista=${selectedId}`),
        fetch(`${API_BASE}/results/validated?escala=${pcn}&id_lista=${selectedId}`)
      ]);
      const [eData, pData, vData] = await Promise.all([eRes.json(), pRes.json(), vRes.json()]);
      
      setResEquipments((eData || []).sort((a: any, b: any) => (a.equipamiento || "").localeCompare(b.equipamiento || "")));
      setResPartidas(pData);
      setValidationDetail((vData.detalle || []).sort((a: any, b: any) => (a.contenedorId || "").localeCompare(b.contenedorId || "")));
    } catch (err) {
      console.error("Error fetching results:", err);
      setStatus({ type: 'error', message: 'Failed to load results.' });
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    const summaryData = buildSummary();
    const headers = ["Contenedor", "Situación Básica", "% Dif Básica", "Situación Avanzada", "% Dif Avanzada"];
    const csvContent = [
      headers.join(";"),
      ...summaryData.map(row => [
        row.id,
        row.s4Status,
        row.s4DiffPct.toFixed(2) + "%",
        row.s5Status,
        row.s5DiffPct.toFixed(2) + "%"
      ].join(";"))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ETL_Summary_${pcn}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleStep7Run = async () => {
    setLoading(true);
    setStatus({ type: 'info', message: 'Processing Step 7: Migrating data to LSP tables...' });

    try {
      // 1. Trigger ETL
      const loadRes = await fetch(`${API_BASE}/step7/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ num_escala: pcn })
      });
      const loadData = await loadRes.json();
      
      if (loadData.status === 'success' || loadData.status === 'warning') {
        setStatus({ 
          type: loadData.status === 'success' ? 'success' : 'info', 
          message: loadData.message || `Step 7 ETL Completed: ${loadData.equipmentsCount} equipments migrated.` 
        });

        // 2. Fetch Results
        const res = await fetch(`${API_BASE}/step7/results?escala=${pcn}`);
        const data = await res.json();
        setStep7Data(data);
        
        setTimeout(() => setStep(7), 1500);
      } else {
        setStatus({ type: 'error', message: loadData.error || 'Failed to execute Step 7' });
      }
    } catch (err) {
      console.error("Error in Step 7:", err);
      setStatus({ type: 'error', message: 'Error communicating with backend.' });
    } finally {
      setLoading(false);
    }
  };

  const buildSummary = () => {
    return resEquipments.map(eq => {
      const myPartidas = resPartidas.filter(p => p.equipamiento === eq.equipamiento);
      const uniqueMap: Record<string, any> = {};
      myPartidas.forEach(p => {
        const ex = uniqueMap[p.id_documento_partida];
        if (!ex || new Date(p.fecha_evento) > new Date(ex.fecha_evento)) uniqueMap[p.id_documento_partida] = p;
      });
      const sumPartidas = Object.values(uniqueMap).reduce((acc: number, p: any) => acc + (p.peso || 0), 0);
      const netWeight = (eq.peso || 0) - (eq.tara || 0);
      const s4Diff = Math.abs(netWeight - sumPartidas);
      const s4DiffPct = netWeight > 0 ? (s4Diff / netWeight) * 100 : 0;
      const s4Status = s4DiffPct <= 10 ? 'OK' : 'KO';

      const s5Result = validationDetail.find(d => d.contenedorId === eq.equipamiento);
      const s5Status = s5Result ? s5Result.estado : 'N/A';
      
      // For Step 5, % diff is a bit more complex (might be group based), but we'll show the individual container's "desvío" if possible.
      // For now, let's use the same logic or the algorithm's reported diff if we had it.
      // Since 'validar' returns 'motivo' with diff, we'll estimate it for simplicity in the table.
      const s5DiffPct = s5Result && s5Result.pesoNeto > 0 ? (Math.abs(s5Result.pesoNeto - (s5Result.pesoExclusivas + s5Result.porcionCompartida)) / s5Result.pesoNeto * 100) : 0;

      return {
        id: eq.equipamiento,
        s4Status,
        s4DiffPct,
        s5Status,
        s5DiffPct
      };
    });
  };

  return (
    <div className="app-container">
      <header>
        <h1>Portic ETL Portal</h1>
        <p className="subtitle">Modern Oracle to PostgreSQL Data Bridge</p>
      </header>

      <div className="stepper">
        <div className={`step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>1</div>
        <div className={`step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>2</div>
        <div className={`step ${step >= 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`}>3</div>
        <div className={`step ${step >= 4 ? 'active' : ''} ${step > 4 ? 'completed' : ''}`}>4</div>
        <div className={`step ${step >= 6 ? 'active' : ''} ${step > 6 ? 'completed' : ''}`}>6</div>
        <div className={`step ${step >= 7 ? 'active' : ''} ${step > 7 ? 'completed' : ''}`}>7</div>
        <div className={`step ${step >= 8 ? 'active' : ''} ${step > 8 ? 'completed' : ''}`}>8</div>
      </div>

      {status && (
        <div className="glass-card fade-in" style={{ 
          borderColor: status.type === 'error' ? '#ef4444' : status.type === 'success' ? '#10b981' : '#3b82f6',
          marginBottom: '1.5rem',
          padding: '1rem',
          borderLeft: '4px solid'
        }}>
          {status.message}
        </div>
      )}

      {step === 1 && (
        <div className="glass-card fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h2>Step 1: Select Message</h2>
              <p className="subtitle">Search and select COPRAR message from Oracle</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div className="search-group" style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Numero de Escala..." 
                  value={escalaSearch}
                  onChange={(e) => setEscalaSearch(e.target.value)}
                  style={{ width: '200px', marginBottom: 0 }}
                />
                <button 
                  className="btn btn-primary" 
                  onClick={() => fetchMessages(escalaSearch)}
                  disabled={loading}
                >
                  Search
                </button>
              </div>
              <button 
                className="btn btn-primary" 
                disabled={(!selectedId || !pcn) || loading}
                onClick={() => setStep(2)}
              >
                Continue to Step 2
              </button>
            </div>
          </div>
          
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div className="loader"></div> Loading messages...
            </div>
          ) : (
            <>
              {messages.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID Interno</th>
                      <th>Date</th>
                      <th>Port Call</th>
                      <th>Containers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.map((msg) => (
                      <tr 
                        key={msg.ID_INTERNO} 
                        className={selectedId === msg.ID_INTERNO ? 'selected' : ''}
                        onClick={() => handleSelect(msg)}
                      >
                        <td>{msg.ID_INTERNO}</td>
                        <td>{new Date(msg.MESSAGE_DATE).toLocaleDateString()}</td>
                        <td>{msg.PORT_CALL_NUMBER}</td>
                        <td>{msg.NUM_CONTENEDORES}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                  No messages found in Oracle.
                </div>
              )}

              <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                <h3>Manual Entry (Optional)</h3>
                <p className="subtitle">Provide scale data if not found in the list above</p>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Manual ID_INTERNO</label>
                    <input 
                      className="form-input" 
                      type="number" 
                      value={selectedId || ''} 
                      onChange={(e) => setSelectedId(parseInt(e.target.value))} 
                      placeholder="Ex: 56789"
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Manual Port Call Number</label>
                    <input 
                      className="form-input" 
                      value={pcn} 
                      onChange={(e) => setPcn(e.target.value)} 
                      placeholder="Ex: 20240123"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="glass-card fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h2>Step 2: Configuration</h2>
              <p className="subtitle">Set parameters for equipment loading</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="button" className="btn" onClick={() => setStep(1)} style={{ color: 'white' }}>
                Back
              </button>
              <button type="submit" form="step2Form" className="btn btn-primary" disabled={loading}>
                {loading && <div className="loader"></div>}
                Execute Step 2
              </button>
            </div>
          </div>
          
          <form id="step2Form" onSubmit={handleStep2Submit} style={{ marginTop: '1.5rem' }}>
            <div className="form-group">
              <label>Selected ID_INTERNO</label>
              <input className="form-input" value={selectedId || ''} disabled />
            </div>
            
            <div className="form-group">
              <label>Port Call Number (PCN)</label>
              <input 
                className="form-input" 
                value={pcn} 
                onChange={(e) => setPcn(e.target.value)} 
                placeholder="Ex: 20240123"
              />
            </div>

            <div className="form-group">
              <label>Max Registros</label>
              <input 
                type="number" 
                className="form-input" 
                value={maxReg} 
                onChange={(e) => setMaxReg(parseInt(e.target.value))} 
                min="1"
              />
            </div>
          </form>
        </div>
      )}

      {step === 3 && (
        <div className="glass-card fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h2>Step 3: Final Processing</h2>
              <p className="subtitle">Load partidas and events for the scale</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn" onClick={() => setStep(2)} style={{ color: 'white' }}>
                Back
              </button>
              <button className="btn btn-primary" onClick={handleStep3Run} disabled={loading}>
                {loading && <div className="loader"></div>}
                Run Step 3
              </button>
            </div>
          </div>
          
          <div style={{ marginTop: '1.5rem', background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '12px' }}>
            <p><strong>Processing PCN:</strong> {pcn}</p>
            <p style={{ marginTop: '0.5rem', color: '#9ca3af' }}>
              This step will retrieve all equipamientos associated with this scale in PostgreSQL 
              and fetch their corresponding partidas and events from Oracle.
            </p>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="glass-card fade-in" style={{ width: '100%', maxWidth: '1200px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <div>
              <h2>Step 4: ETL Results</h2>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button 
                  className={`btn ${activeResultsTab === 'step4' ? 'btn-primary' : ''}`}
                  onClick={() => setActiveResultsTab('step4')}
                  style={{ padding: '0.4rem 1rem', fontSize: '0.9rem' }}
                >
                  Vista Básica (Piso 4)
                </button>
                <button 
                  className={`btn ${activeResultsTab === 'step5' ? 'btn-primary' : ''}`}
                  onClick={() => setActiveResultsTab('step5')}
                  style={{ padding: '0.4rem 1rem', fontSize: '0.9rem' }}
                >
                  Algoritmo Avanzado (Piso 5)
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div className="summary-stat">
                <span>TOTAL</span>
                <span className="count">{activeResultsTab === 'step5' ? validationDetail.length : resEquipments.length}</span>
              </div>
              <div className="summary-stat ok">
                <span>OK/WARN</span>
                <span className="count">{activeResultsTab === 'step5' ? stats.s5OK : stats.s4OK}</span>
              </div>
              <div className="summary-stat ko">
                <span>KO</span>
                <span className="count">{activeResultsTab === 'step5' ? stats.s5KO : stats.s4KO}</span>
              </div>
              <button className="btn btn-primary" onClick={() => setStep(6)}>
                Summary (Step 6)
              </button>
            </div>
          </div>
          
          <div style={{ marginTop: '1rem' }}>
            {activeResultsTab === 'step5' ? (
              // Step 5 View (Algorithm)
              validationDetail.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                  No results found.
                </div>
              ) : validationDetail.map(d => {
                const myPartidas = resPartidas.filter(p => p.equipamiento === d.contenedorId);
                const uniqueMap: Record<string, PartidaResult> = {};
                myPartidas.forEach(p => {
                  const ex = uniqueMap[p.id_documento_partida];
                  if (!ex || new Date(p.fecha_evento) > new Date(ex.fecha_evento)) uniqueMap[p.id_documento_partida] = p;
                });
                const myUniquePartidas = Object.values(uniqueMap);

                return (
                  <div key={d.contenedorId} className="result-card" style={{ 
                    borderLeft: `4px solid ${d.estado === 'OK' ? '#10b981' : d.estado === 'WARN' ? '#f59e0b' : '#ef4444'}`
                  }}>
                    <div className="result-header">
                      <div className="info-grid">
                        <p><strong>Contenedor:</strong> <span className="highlight-blue">{d.contenedorId}</span></p>
                        <p><strong>Bruto:</strong> {d.pesoBruto}</p>
                        <p><strong>Tara:</strong> {d.tara}</p>
                        <p><strong>Neto:</strong> <span className="highlight-yellow">{d.pesoNeto}</span></p>
                        <p><strong>Suma Excl:</strong> {d.pesoExclusivas}</p>
                        <p><strong>Porción Comp:</strong> <span className="highlight-blue">{d.porcionCompartida}</span></p>
                        <p><strong>Estado:</strong> <span className={`status-${d.estado.toLowerCase()}`}>{d.estado}</span></p>
                      </div>
                    </div>
                    <p className="motivo"><strong>Motivo:</strong> {d.motivo}</p>

                    {d.grupoContenedores && d.grupoContenedores.length > 1 && (
                      <div className="group-info" style={{ 
                        marginTop: '1rem', 
                        padding: '1rem', 
                        background: 'rgba(59,130,246,0.05)', 
                        borderRadius: '12px',
                        border: '1px solid rgba(59,130,246,0.2)'
                      }}>
                        <h4 style={{ color: '#60a5fa', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Contenedores Relacionados (Grupo)</h4>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {d.grupoContenedores.map((cid: string) => (
                            <span key={cid} style={{ 
                              padding: '0.2rem 0.6rem', 
                              background: cid === d.contenedorId ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: cid === d.contenedorId ? 'bold' : 'normal'
                            }}>
                              {cid}
                            </span>
                          ))}
                        </div>
                        {d.grupoPartidas && (
                          <div style={{ marginTop: '0.8rem' }}>
                            <h4 style={{ color: '#fbbf24', marginBottom: '0.3rem', fontSize: '0.9rem' }}>Partidas del Grupo</h4>
                            <p style={{ fontSize: '0.8rem', color: '#d1d5db' }}>{d.grupoPartidas.join(', ')}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {myUniquePartidas.length > 0 && (
                      <div className="table-responsive" style={{ marginTop: '0.8rem' }}>
                        <table className="data-table compact">
                          <thead>
                            <tr>
                              <th>Partida</th>
                              <th>Tipo</th>
                              <th>Peso</th>
                              <th>Evento</th>
                            </tr>
                          </thead>
                          <tbody>
                            {myUniquePartidas.map(p => (
                              <tr key={p.id}>
                                <td>{p.id_documento_partida}</td>
                                <td>{p.tipo_documento}</td>
                                <td>{p.peso}</td>
                                <td>{p.nombre_evento}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              // Step 4 View (Basic)
              resEquipments.map(eq => {
                const myPartidas = resPartidas.filter(p => p.equipamiento === eq.equipamiento);
                const uniqueMap: Record<string, any> = {};
                myPartidas.forEach(p => {
                  const ex = uniqueMap[p.id_documento_partida];
                  if (!ex || new Date(p.fecha_evento) > new Date(ex.fecha_evento)) uniqueMap[p.id_documento_partida] = p;
                });
                const myUniquePartidas = Object.values(uniqueMap);
                const sumPartidas = myUniquePartidas.reduce((acc: number, p: any) => acc + (p.peso || 0), 0);
                const netWeight = (eq.peso || 0) - (eq.tara || 0);
                const isOK = Math.abs(netWeight - sumPartidas) <= (netWeight * 0.1);

                return (
                  <div key={eq.id} className="result-card" style={{ 
                    borderLeft: `4px solid ${isOK ? '#10b981' : '#ef4444'}`
                  }}>
                    <div className="result-header">
                      <div className="info-grid">
                        <p><strong>Contenedor:</strong> <span className="highlight-blue">{eq.equipamiento}</span></p>
                        <p><strong>Neto:</strong> {netWeight}</p>
                        <p><strong>Suma Partidas:</strong> {sumPartidas}</p>
                        <p><strong>Estado:</strong> <span className={isOK ? 'status-ok' : 'status-ko'}>{isOK ? 'OK' : 'KO'}</span></p>
                      </div>
                    </div>
                    {myUniquePartidas.length > 0 && (
                      <div className="table-responsive" style={{ marginTop: '0.8rem' }}>
                        <table className="data-table compact">
                          <thead>
                            <tr>
                              <th>Partida</th>
                              <th>Tipo</th>
                              <th>Peso</th>
                            </tr>
                          </thead>
                          <tbody>
                            {myUniquePartidas.map(p => (
                              <tr key={p.id}>
                                <td>{p.id_documento_partida}</td>
                                <td>{p.tipo_documento}</td>
                                <td>{p.peso}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="glass-card fade-in" style={{ width: '100%', maxWidth: '1200px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h2>Step 6: Comparative Summary</h2>
              <p className="subtitle">Detailed analysis between Basic and Advanced versions (10% Tolerance)</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn" onClick={() => setStep(4)} style={{ color: 'white' }}>
                Back
              </button>
              <button className="btn btn-primary" onClick={exportToExcel}>
                Export CSV
              </button>
              <button className="btn btn-primary" onClick={handleStep7Run} disabled={loading}>
                {loading && <div className="loader"></div>}
                Step 7 (LSP)
              </button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contenedor</th>
                  <th>Vista Básica</th>
                  <th>% Dif Básica</th>
                  <th>Algo. Avanzado</th>
                  <th>% Dif Avanzado</th>
                </tr>
              </thead>
              <tbody>
                {buildSummary().map(row => (
                  <tr key={row.id}>
                    <td><span className="highlight-blue">{row.id}</span></td>
                    <td><span className={row.s4Status === 'OK' ? 'status-ok' : 'status-ko'}>{row.s4Status}</span></td>
                    <td>{row.s4DiffPct.toFixed(2)}%</td>
                    <td><span className={`status-${row.s5Status.toLowerCase()}`}>{row.s5Status}</span></td>
                    <td>{row.s5DiffPct.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 7 && (
        <div className="glass-card fade-in" style={{ width: '100%', maxWidth: '1200px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h2>Step 7: LSP Data Migration Results</h2>
              <p className="subtitle">Hierarchical view of migrated equipments and documents for Scale {pcn}</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div className="summary-stat">
                <span>TOTAL</span>
                <span className="count">{step7Data.length}</span>
              </div>
              <div className="summary-stat ok">
                <span>OK</span>
                <span className="count">{stats.s7OK}</span>
              </div>
              <div className="summary-stat ko">
                <span>KO</span>
                <span className="count">{stats.s7KO}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn" onClick={() => setStep(6)} style={{ color: 'white' }}>
                  Back
                </button>
                <button className="btn btn-primary" onClick={() => setStep(8)}>
                  Step 8 (Comp)
                </button>
              </div>
            </div>
          </div>

          <div className="step7-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {step7Data.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                <p>No data migrated for this scale.</p>
              </div>
            ) : (
              step7Data.map((eq) => (
                <div key={eq.id} className="result-card" style={{ borderLeft: '4px solid #3b82f6', background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', gap: '2rem' }}>
                      <p><strong>Equipamiento:</strong> <span className="highlight-blue">{eq.equipamiento}</span></p>
                      <p><strong>Estado:</strong> <span className={`status-${eq.estado.toLowerCase()}`}>{eq.estado}</span></p>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>ID: {eq.id}</span>
                  </div>

                  {eq.datos.length > 0 ? (
                    <div className="table-responsive">
                      <table className="data-table compact">
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <th>Documento (numdoc)</th>
                            <th>Peso Partida</th>
                          </tr>
                        </thead>
                        <tbody>
                          {eq.datos.map((d, idx) => (
                            <tr key={idx}>
                              <td>{d.numdoc}</td>
                              <td><span className="highlight-yellow">{d.peso}</span> kg</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>Total Documentos:</td>
                            <td style={{ fontWeight: 'bold' }}>{eq.datos.reduce((acc: number, curr: any) => acc + (curr.peso || 0), 0)} kg</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <p style={{ fontStyle: 'italic', color: '#9ca3af', fontSize: '0.9rem' }}>No documents found for this equipment.</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {step === 8 && (
        <div className="glass-card fade-in" style={{ width: '100%', maxWidth: '1200px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h2>Step 8: Cross-Source Comparison</h2>
              <p className="subtitle">Comparing final results across Basic, Advanced, and LSP sources. Click a row to see triple detail.</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn" onClick={() => setStep(7)} style={{ color: 'white' }}>
                Back
              </button>
              <button className="btn btn-primary" onClick={() => window.location.reload()}>
                New Flow
              </button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contenedor</th>
                  <th>Básica (Paso 4)</th>
                  <th>Avanzada (Paso 5)</th>
                  <th>LSP (Paso 7 - PG)</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map(row => (
                  <tr 
                    key={row.id} 
                    onClick={() => {
                      setSelectedCompareId(row.id);
                      setStep(9);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td><span className="highlight-blue" style={{ fontWeight: selectedCompareId === row.id ? 'bold' : 'normal' }}>{row.id}</span></td>
                    <td>
                      <span className={row.s4Status === 'OK' ? 'status-ok' : row.s4Status === 'N/A' ? '' : 'status-ko'}>
                        {row.s4Status}
                      </span>
                    </td>
                    <td>
                      <span className={`status-${row.s5Status.toLowerCase()}`}>
                        {row.s5Status}
                      </span>
                    </td>
                    <td>
                      <span className={`status-${row.s7Status.toLowerCase()}`}>
                        {row.s7Status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 9 && selectedCompareId && (
        <div className="glass-card fade-in" style={{ width: '100%', maxWidth: '1400px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <h2 style={{ margin: 0 }}>Detalle del Contenedor: <span className="highlight-blue">{selectedCompareId}</span></h2>
                {(() => {
                  const eq = resEquipments.find(e => e.equipamiento === selectedCompareId);
                  return eq ? (
                    <div className="summary-stat" style={{ padding: '0.4rem 1rem' }}>
                      <span>Peso Neto (Paso 4)</span>
                      <span className="count" style={{ fontSize: '1.1rem' }}>{eq.peso - (eq.tara || 0)} kg</span>
                    </div>
                  ) : null;
                })()}
              </div>
              <p className="subtitle" style={{ marginTop: '0.5rem' }}>Análisis completo de las tres fuentes de datos (Básica, Avanzada y LSP)</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                className="btn" 
                onClick={() => setStep(6)} 
                style={{ color: 'white', background: 'rgba(255,255,255,0.05)' }}
              >
                Volver a Resumen (Paso 6)
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => setStep(8)}
              >
                Volver a Comparación (Paso 8)
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            {/* Source 1: Básica (Step 4) */}
            <div className="detail-section" style={{ background: 'rgba(255,255,255,0.02)', padding: '2rem', borderRadius: '20px', border: '1px solid rgba(59,130,246,0.3)' }}>
              <h3 style={{ color: '#3b82f6', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.7rem', fontSize: '1.5rem' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 10px #3b82f6' }}></span>
                1. Vista Básica (Oracle)
              </h3>
              {(() => {
                const eq = resEquipments.find(e => e.equipamiento === selectedCompareId);
                const myPartidas = resPartidas.filter(p => p.equipamiento === selectedCompareId);
                const uniqueMap: Record<string, any> = {};
                myPartidas.forEach(p => {
                  const ex = uniqueMap[p.id_documento_partida];
                  if (!ex || new Date(p.fecha_evento) > new Date(ex.fecha_evento)) uniqueMap[p.id_documento_partida] = p;
                });
                const myUniquePartidas = Object.values(uniqueMap);
                const sumPartidas = myUniquePartidas.reduce((acc: number, p: any) => acc + (p.peso || 0), 0);
                const netWeight = eq ? (eq.peso - (eq.tara || 0)) : 0;
                const isOK = Math.abs(netWeight - sumPartidas) <= (netWeight * 0.1);

                return (
                  <div>
                    <div className="info-grid" style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.5rem' }}>
                      <div className="stat-box">
                        <label>Peso Bruto</label>
                        <p>{eq?.peso || 'N/A'} kg</p>
                      </div>
                      <div className="stat-box">
                        <label>Tara</label>
                        <p>{eq?.tara || 0} kg</p>
                      </div>
                      <div className="stat-box">
                        <label>Suma Partidas</label>
                        <p className="highlight-yellow">{sumPartidas} kg</p>
                      </div>
                      <div className="stat-box">
                        <label>Diferencia</label>
                        <p style={{ color: isOK ? 'var(--success-color)' : '#ef4444' }}>{Math.abs(netWeight - sumPartidas).toFixed(2)} kg</p>
                      </div>
                      <div className="stat-box">
                        <label>Estado</label>
                        <p className={isOK ? 'status-ok' : 'status-ko'}>{isOK ? 'OK' : 'KO'}</p>
                      </div>
                    </div>
                    
                    <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Partidas y Eventos Detectados</h4>
                    <div className="table-responsive">
                      <table className="data-table compact">
                        <thead>
                          <tr>
                            <th>Documento</th>
                            <th>Peso</th>
                            <th>Tipo</th>
                            <th>Último Evento</th>
                            <th>Fecha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {myUniquePartidas.map((p: any) => (
                            <tr key={p.id}>
                              <td><strong>{p.id_documento_partida}</strong></td>
                              <td><span className="highlight-yellow">{p.peso} kg</span></td>
                              <td>{p.tipo_documento}</td>
                              <td>{p.nombre_evento}</td>
                              <td>{new Date(p.fecha_evento).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Source 2: Avanzada (Step 5) */}
            <div className="detail-section" style={{ background: 'rgba(255,255,255,0.02)', padding: '2rem', borderRadius: '20px', border: '1px solid rgba(245,158,11,0.3)' }}>
              <h3 style={{ color: '#f59e0b', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.7rem', fontSize: '1.5rem' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 10px #f59e0b' }}></span>
                2. Algoritmo Avanzado (Lógica de Grupos)
              </h3>
              {(() => {
                const d = validationDetail.find(e => e.contenedorId === selectedCompareId);
                const myPartidas = resPartidas.filter(p => p.equipamiento === selectedCompareId);
                return d ? (
                  <div>
                    <div className="info-grid" style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.5rem' }}>
                      <div className="stat-box">
                        <label>Peso Neto Alg</label>
                        <p>{d.pesoNeto} kg</p>
                      </div>
                      <div className="stat-box">
                        <label>Suma Exclusivas</label>
                        <p>{d.pesoExclusivas} kg</p>
                      </div>
                      <div className="stat-box">
                        <label>Porción Compartida</label>
                        <p style={{ color: '#60a5fa' }}>{d.porcionCompartida} kg</p>
                      </div>
                      <div className="stat-box">
                        <label>Desviación</label>
                        <p>{Math.abs(d.pesoNeto - (d.pesoExclusivas + d.porcionCompartida)).toFixed(2)} kg</p>
                      </div>
                      <div className="stat-box">
                        <label>Resultado</label>
                        <p className={`status-${d.estado.toLowerCase()}`}>{d.estado}</p>
                      </div>
                    </div>
                    
                    <div style={{ marginBottom: '2rem', padding: '1.2rem', background: 'rgba(245,158,11,0.05)', borderRadius: '12px', border: '1px solid rgba(245,158,11,0.2)' }}>
                      <h4 style={{ color: '#fbbf24', marginBottom: '0.5rem' }}>Motivo de la Validación</h4>
                      <p style={{ fontSize: '1rem', color: '#f3f4f6', lineHeight: '1.5' }}>{d.motivo}</p>
                    </div>

                    {d.grupoContenedores && d.grupoContenedores.length > 1 && (
                      <div className="group-detail" style={{ marginBottom: '2rem', padding: '1.5rem', background: 'rgba(59,130,246,0.03)', borderRadius: '15px', border: '1px solid rgba(59,130,246,0.15)' }}>
                        <h4 style={{ color: '#60a5fa', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#60a5fa' }}></span>
                          Componentes del Grupo (Asociación por Peso)
                        </h4>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                          <div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Contenedores Participantes:</p>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                              {d.grupoContenedores.map((cid: string) => (
                                <div key={cid} style={{ 
                                  padding: '0.4rem 0.8rem', 
                                  background: cid === selectedCompareId ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                                  borderRadius: '8px',
                                  border: `1px solid ${cid === selectedCompareId ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                                  fontSize: '0.9rem'
                                }}>
                                  {cid} {cid === selectedCompareId && '(Actual)'}
                                </div>
                              ))}
                            </div>
                            {(() => {
                              const groupNetSum = validationDetail
                                .filter(v => d.grupoContenedores.includes(v.contenedorId))
                                .reduce((acc: number, v: any) => acc + (v.porcionCompartida || 0), 0);
                              return (
                                <div className="stat-box mini" style={{ background: 'rgba(59,130,246,0.1)' }}>
                                  <label style={{ fontSize: '0.75rem' }}>Suma Porciones Grupo</label>
                                  <p style={{ fontSize: '1.1rem', color: '#60a5fa' }}>{groupNetSum.toFixed(2)} kg</p>
                                </div>
                              );
                            })()}
                          </div>
                          <div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Partidas Compartidas:</p>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                              {d.grupoPartidas?.map((pid: string) => (
                                <div key={pid} style={{ 
                                  padding: '0.4rem 0.8rem', 
                                  background: 'rgba(245,158,11,0.1)',
                                  borderRadius: '8px', 
                                  border: '1px solid rgba(245,158,11,0.2)',
                                  color: '#fbbf24',
                                  fontSize: '0.9rem'
                                }}>
                                  {pid}
                                </div>
                              ))}
                            </div>
                            {(() => {
                              const uniqueGroupPartidas = Array.from(new Set(d.grupoPartidas)) as string[];
                              const groupPartidasSum = uniqueGroupPartidas.reduce((acc: number, pid: string) => {
                                const p = resPartidas.find(rp => rp.id_documento_partida === pid);
                                return acc + (p?.peso || 0);
                              }, 0);
                              return (
                                <div className="stat-box mini" style={{ background: 'rgba(245,158,11,0.1)' }}>
                                  <label style={{ fontSize: '0.75rem' }}>Suma Pesos Partidas</label>
                                  <p style={{ fontSize: '1.1rem', color: '#fbbf24' }}>{groupPartidasSum} kg</p>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        
                        <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic' }}>
                          * El algoritmo ha verificado que la **Suma de Porciones** ({
                            validationDetail
                              .filter(v => d.grupoContenedores.includes(v.contenedorId))
                              .reduce((acc: number, v: any) => acc + (v.porcionCompartida || 0), 0).toFixed(0)
                          } kg) coincide con la **Suma de Partidas** ({
                            (Array.from(new Set(d.grupoPartidas)) as string[]).reduce((acc: number, pid: string) => {
                              const p = resPartidas.find(rp => rp.id_documento_partida === pid);
                              return acc + (p?.peso || 0);
                            }, 0)
                          } kg) dentro de la tolerancia del 10%.
                        </p>
                      </div>
                    )}

                    <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Partidas Analizadas por el Algoritmo</h4>
                    <div className="table-responsive">
                      <table className="data-table compact">
                        <thead>
                          <tr>
                            <th>Documento</th>
                            <th>Peso Informativo</th>
                            <th>Tipo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {myPartidas.map((p: any) => (
                            <tr key={p.id}>
                              <td><strong>{p.id_documento_partida}</strong></td>
                              <td><span className="highlight-yellow">{p.peso} kg</span></td>
                              <td>{p.tipo_documento}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : <p>No hay detalles avanzados disponibles para este contenedor.</p>;
              })()}
            </div>

            {/* Source 3: LSP (Step 7) */}
            <div className="detail-section" style={{ background: 'rgba(255,255,255,0.02)', padding: '2rem', borderRadius: '20px', border: '1px solid rgba(16,185,129,0.3)' }}>
              <h3 style={{ color: '#10b981', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.7rem', fontSize: '1.5rem' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 10px #10b981' }}></span>
                3. LSP (PostgreSQL Migrado)
              </h3>
              {(() => {
                const eq = step7Data.find(e => e.equipamiento === selectedCompareId);
                return eq ? (
                  <div>
                    <div className="info-grid" style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.5rem' }}>
                      <div className="stat-box">
                        <label>Estado LSP</label>
                        <p className={`status-${eq.estado.toLowerCase()}`}>{eq.estado}</p>
                      </div>
                      <div className="stat-box">
                        <label>ID Registro PG</label>
                        <p style={{ fontSize: '0.9rem' }}>{eq.id}</p>
                      </div>
                      <div className="stat-box">
                        <label>Total Peso Docs</label>
                        <p className="highlight-yellow">{eq.datos.reduce((acc: number, curr: any) => acc + curr.peso, 0)} kg</p>
                      </div>
                      <div className="stat-box">
                        <label>Num. Documentos</label>
                        <p>{eq.datos.length}</p>
                      </div>
                    </div>

                    <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Documentos Recuperados de Oracle/PG</h4>
                    <div className="table-responsive">
                      <table className="data-table compact">
                        <thead>
                          <tr>
                            <th>Num. Documento</th>
                            <th>Peso</th>
                          </tr>
                        </thead>
                        <tbody>
                          {eq.datos.map((d, idx) => (
                            <tr key={idx}>
                              <td><strong>{d.numdoc}</strong></td>
                              <td><span className="highlight-yellow">{d.peso} kg</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : <p>No se encontraron datos LSP migrados para este contenedor.</p>;
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
