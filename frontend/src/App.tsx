import { useState, useEffect, useRef, useCallback } from 'react';
import initWebGPU, { WebGPULife } from '../../webgpu-life/pkg/webgpu_life';
import './App.css';

const GRID_SIZE = 512;

function App() {
  const [mode, setMode] = useState<'WebGPU' | 'HashLife'>('WebGPU');
  const [running, setRunning] = useState(true);
  const [density, setDensity] = useState(0.2);
  const [exponent, setExponent] = useState(10);
  const [birthRule, setBirthRule] = useState(1 << 3);
  const [surviveRule, setSurviveRule] = useState((1 << 2) | (1 << 3));
  const [aliveColor, setAliveColor] = useState('#00ff00');
  const [deadColor, setDeadColor] = useState('#1a1a1a');
  const [stats, setStats] = useState({ fps: 0, generation: 0 });
  const generationRef = useRef<number>(0);
  const [hashLifeStats, setHashLifeStats] = useState<{gen: string, pop: string, time: number} | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webgpuLifeRef = useRef<WebGPULife | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [workerReady, setWorkerReady] = useState(false);
  const requestRef = useRef<number>(null);
  const lastTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);

  // Hex to RGB
  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b, 1.0];
  };

  // WebGPU Init
  useEffect(() => {
    if (mode === 'WebGPU' && canvasRef.current && !webgpuLifeRef.current) {
      const init = async () => {
        await initWebGPU();
        const life = await WebGPULife.new(canvasRef.current!, GRID_SIZE, GRID_SIZE);
        webgpuLifeRef.current = life;
      };
      init();
    }
  }, [mode]);

  // WebGPU Loop
  useEffect(() => {
    const animate = (time: number) => {
      if (webgpuLifeRef.current && running && mode === 'WebGPU') {
        webgpuLifeRef.current.run_frame();
        frameCountRef.current++;
        generationRef.current++;

        if (time - lastTimeRef.current >= 1000) {
          setStats({
            fps: Math.round((frameCountRef.current * 1000) / (time - lastTimeRef.current)),
            generation: generationRef.current
          });
          lastTimeRef.current = time;
          frameCountRef.current = 0;
        }
      }
      requestRef.current = requestAnimationFrame(animate);
    };
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [running, mode]);

  // Update Backend Params
  useEffect(() => {
    if (webgpuLifeRef.current) {
      webgpuLifeRef.current.update_params(
        birthRule,
        surviveRule,
        new Float32Array(hexToRgb(aliveColor)),
        new Float32Array(hexToRgb(deadColor))
      );
    }
  }, [birthRule, surviveRule, aliveColor, deadColor]);

  // HashLife Worker Init
  useEffect(() => {
    const worker = new Worker(new URL('./hashlife.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      if (e.data.type === 'ready') setWorkerReady(true);
      else if (e.data.type === 'step_result') {
        setHashLifeStats({
          gen: e.data.generation,
          pop: e.data.population,
          time: e.data.duration
        });
      }
    };
    worker.postMessage({ type: 'init' });
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const toggleRule = (bit: number, isBirth: boolean) => {
    if (isBirth) setBirthRule(prev => prev ^ (1 << bit));
    else setSurviveRule(prev => prev ^ (1 << bit));
  };

  const handleCanvasInteraction = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !webgpuLifeRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * GRID_SIZE);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * GRID_SIZE);

    // Draw a small 3x3 block on click/drag
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const nx = x + i;
        const ny = y + j;
        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
          webgpuLifeRef.current.set_cell(nx, ny, 1);
        }
      }
    }
  }, []);

  const [isDrawing, setIsDrawing] = useState(false);
  const [rleInput, setRleInput] = useState('x = 3, y = 3, rule = B3/S23\nbo$2bo$3o!');

  const handleReset = () => {
    if (webgpuLifeRef.current) {
      webgpuLifeRef.current.reset(density);
      generationRef.current = 0;
      setStats(prev => ({ ...prev, generation: 0 }));
    }
  };

  const applyPreset = (preset: string) => {
    if (preset === 'glider') {
      setBirthRule(1 << 3);
      setSurviveRule((1 << 2) | (1 << 3));
      if (webgpuLifeRef.current) {
        webgpuLifeRef.current.reset(0);
        const mid = Math.floor(GRID_SIZE / 2);
        webgpuLifeRef.current.set_cell(mid, mid - 1, 1);
        webgpuLifeRef.current.set_cell(mid + 1, mid, 1);
        webgpuLifeRef.current.set_cell(mid - 1, mid + 1, 1);
        webgpuLifeRef.current.set_cell(mid, mid + 1, 1);
        webgpuLifeRef.current.set_cell(mid + 1, mid + 1, 1);
      }
    } else if (preset === 'gosper') {
      // Small density for randomized large-scale soup
      setDensity(0.15);
      handleReset();
    } else if (preset === 'highlife') {
      setBirthRule((1 << 3) | (1 << 6));
      setSurviveRule((1 << 2) | (1 << 3));
    }
  };

  const loadRleToHashLife = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'init', rle: rleInput });
    }
  };

  const handleJump = () => {
    if (workerRef.current && workerReady) {
      workerRef.current.postMessage({ type: 'step', exponent });
    }
  };

  const renderRuleBits = (rule: number, isBirth: boolean) => {
    return (
      <div className="rule-checker">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(bit => (
          <div
            key={bit}
            className={`rule-bit ${ (rule & (1 << bit)) ? 'active' : '' }`}
            onClick={() => toggleRule(bit, isBirth)}
          >
            {bit}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <h1>Life Game Studio</h1>

        <div className="mode-toggle">
          <button className={mode === 'WebGPU' ? 'active' : ''} onClick={() => setMode('WebGPU')}>Real-time</button>
          <button className={mode === 'HashLife' ? 'active' : ''} onClick={() => setMode('HashLife')}>Compute</button>
        </div>

        <section className="control-group">
          <h3>Simulation</h3>
          <div className="button-row">
            <button onClick={() => setRunning(!running)}>{running ? 'Pause' : 'Resume'}</button>
            <button className="secondary" onClick={() => webgpuLifeRef.current?.run_frame()}>Step</button>
          </div>
          <div className="button-row">
            <button className="secondary" onClick={handleReset}>Randomize</button>
            <button className="secondary" onClick={() => webgpuLifeRef.current?.reset(0)}>Clear</button>
          </div>
        </section>

        <section className="control-group">
          <div className="label-row">
            <span>Density</span>
            <span>{Math.round(density * 100)}%</span>
          </div>
          <input type="range" min="0" max="1" step="0.01" value={density} onChange={e => setDensity(parseFloat(e.target.value))} />
        </section>

        <section className="control-group">
          <h3>Rules (B / S)</h3>
          <label>Birth</label>
          {renderRuleBits(birthRule, true)}
          <label style={{marginTop: '8px'}}>Survival</label>
          {renderRuleBits(surviveRule, false)}
        </section>

        <section className="control-group">
          <h3>Presets</h3>
          <div className="button-row" style={{flexWrap: 'wrap'}}>
            <button className="secondary" onClick={() => applyPreset('glider')}>Glider</button>
            <button className="secondary" onClick={() => applyPreset('gosper')}>Soup</button>
            <button className="secondary" onClick={() => applyPreset('highlife')}>HighLife</button>
          </div>
        </section>

        <section className="control-group">
          <h3>Appearance</h3>
          <div className="label-row">
            <label>Alive</label>
            <input type="color" value={aliveColor} onChange={e => setAliveColor(e.target.value)} />
          </div>
          <div className="label-row">
            <label>Dead</label>
            <input type="color" value={deadColor} onChange={e => setDeadColor(e.target.value)} />
          </div>
        </section>

        {mode === 'WebGPU' && (
          <div className="stats-panel">
            <div>FPS: {stats.fps}</div>
            <div>Generation: {stats.generation}</div>
            <div>Resolution: {GRID_SIZE}x{GRID_SIZE}</div>
          </div>
        )}
      </aside>

      <main className="main-content">
        {mode === 'WebGPU' ? (
          <div className="canvas-container">
            <canvas
              ref={canvasRef}
              width={GRID_SIZE}
              height={GRID_SIZE}
              onMouseDown={(e) => { setIsDrawing(true); handleCanvasInteraction(e); }}
              onMouseUp={() => setIsDrawing(false)}
              onMouseLeave={() => setIsDrawing(false)}
              onMouseMove={(e) => { if (isDrawing) handleCanvasInteraction(e); }}
            />
          </div>
        ) : (
          <div style={{maxWidth: '600px', width: '100%'}}>
            <h3>HashLife Long-term Computation</h3>
            <p>Skip massive numbers of generations instantly using the HashLife algorithm.</p>

            <section className="control-group" style={{marginBottom: '20px'}}>
              <label>RLE Pattern Input</label>
              <textarea
                value={rleInput}
                onChange={e => setRleInput(e.target.value)}
                style={{width: '100%', height: '120px', backgroundColor: '#333', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '8px', fontFamily: 'monospace'}}
              />
              <button onClick={loadRleToHashLife} disabled={!workerReady} style={{marginTop: '8px'}}>Load Pattern</button>
            </section>

            <div className="control-group">
              <div className="label-row">
                <span>Step: 2^{exponent}</span>
                <span>{Math.pow(2, exponent).toLocaleString()} gen</span>
              </div>
              <input type="range" min="0" max="64" value={exponent} onChange={e => setExponent(parseInt(e.target.value))} />
              <button onClick={handleJump} disabled={!workerReady} style={{marginTop: '10px'}}>Jump!</button>
            </div>

            {hashLifeStats && (
              <div className="stats-panel" style={{marginTop: '20px'}}>
                <div>Gen: {hashLifeStats.gen}</div>
                <div>Pop: {hashLifeStats.pop}</div>
                <div>Time: {hashLifeStats.time.toFixed(2)} ms</div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
