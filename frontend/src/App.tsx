import { useState, useEffect, useRef, useCallback } from 'react';
import initWebGPU, { WebGPULife } from '../../webgpu-life/pkg/webgpu_life';
import { encodeRLE, decodeRLE } from './utils/rle';
import './App.css';

function App() {
  const [gridSize, setGridSize] = useState(512);
  const [mode, setMode] = useState<'WebGPU' | 'HashLife'>('WebGPU');
  const [running, setRunning] = useState(true);
  const [density, setDensity] = useState(0.2);
  const [exponent, setExponent] = useState(10);
  const [birthRule, setBirthRule] = useState(1 << 3);
  const [surviveRule, setSurviveRule] = useState((1 << 2) | (1 << 3));
  const [aliveColor, setAliveColor] = useState('#00ff00');
  const [deadColor, setDeadColor] = useState('#1a1a1a');
  const [stats, setStats] = useState({ fps: 0, generation: 0 });
  const [zoom, setZoom] = useState(1.0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
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
        const life = await WebGPULife.new(canvasRef.current!, gridSize, gridSize);
        webgpuLifeRef.current = life;
      };
      init();
    }
  }, [mode]);

  // Handle Resize
  useEffect(() => {
    if (webgpuLifeRef.current) {
      webgpuLifeRef.current.resize(gridSize, gridSize);
      generationRef.current = 0;
      setStats(prev => ({ ...prev, generation: 0 }));
    }
  }, [gridSize]);

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
        new Float32Array(hexToRgb(deadColor)),
        new Float32Array([offset.x, offset.y]),
        zoom
      );
    }
  }, [birthRule, surviveRule, aliveColor, deadColor, offset, zoom]);

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

  const [drawMode, setDrawMode] = useState<'Pen' | 'Eraser'>('Pen');

  const handleCanvasInteraction = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !webgpuLifeRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left - offset.x) / zoom);
    const y = Math.floor((e.clientY - rect.top - offset.y) / zoom);

    if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
      webgpuLifeRef.current.set_cell(x, y, drawMode === 'Pen' ? 1 : 0);
    }
  }, [offset, zoom, gridSize, drawMode]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const handleWheel = (e: React.WheelEvent) => {
    const delta = -e.deltaY;
    const factor = 1.1;
    const newZoom = delta > 0 ? zoom * factor : zoom / factor;

    // Zoom towards mouse position
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const dx = (mouseX - offset.x) / zoom;
      const dy = (mouseY - offset.y) / zoom;
      const newOffsetX = mouseX - dx * newZoom;
      const newOffsetY = mouseY - dy * newZoom;

      setZoom(Math.max(0.1, Math.min(100, newZoom)));
      setOffset({ x: newOffsetX, y: newOffsetY });
    }
  };
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
        const mid = Math.floor(gridSize / 2);
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

  const loadRleToWebGPU = () => {
    if (webgpuLifeRef.current) {
      const { cells, width, height } = decodeRLE(rleInput);
      // If dimensions changed, we might need to resize
      if (width > gridSize || height > gridSize) {
        setGridSize(Math.max(width, height));
      }

      webgpuLifeRef.current.reset(0);
      webgpuLifeRef.current.set_cells(0, 0, width, height, cells);
    }
  };

  const exportFromWebGPU = async () => {
    if (webgpuLifeRef.current) {
      const cells = await webgpuLifeRef.current.get_cells();
      const rle = encodeRLE(cells, gridSize, gridSize);
      setRleInput(rle);
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
            <button className={drawMode === 'Pen' ? 'active' : 'secondary'} onClick={() => setDrawMode('Pen')}>Pen</button>
            <button className={drawMode === 'Eraser' ? 'active' : 'secondary'} onClick={() => setDrawMode('Eraser')}>Eraser</button>
          </div>
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

        <section className="control-group">
          <div className="label-row">
            <span>Grid Size</span>
            <span>{gridSize}x{gridSize}</span>
          </div>
          <input type="range" min="64" max="2048" step="64" value={gridSize} onChange={e => setGridSize(parseInt(e.target.value))} />
        </section>

        {mode === 'WebGPU' && (
          <div className="stats-panel">
            <div>FPS: {stats.fps}</div>
            <div>Generation: {stats.generation}</div>
            <div>Resolution: {gridSize}x{gridSize}</div>
            <div>Zoom: {zoom.toFixed(2)}x</div>
          </div>
        )}
      </aside>

      <main className="main-content">
        <div
          className="canvas-container"
          style={{ display: mode === 'WebGPU' ? 'block' : 'none', width: '800px', height: '800px', overflow: 'hidden', background: '#000' }}
          onWheel={handleWheel}
        >
          <canvas
            ref={canvasRef}
            width={800}
            height={800}
            onMouseDown={(e) => {
              if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
                setIsPanning(true);
              } else {
                setIsDrawing(true);
                handleCanvasInteraction(e);
              }
              lastMousePos.current = { x: e.clientX, y: e.clientY };
            }}
            onMouseUp={() => { setIsDrawing(false); setIsPanning(false); }}
            onMouseLeave={() => { setIsDrawing(false); setIsPanning(false); }}
            onMouseMove={(e) => {
              if (isPanning) {
                const dx = e.clientX - lastMousePos.current.x;
                const dy = e.clientY - lastMousePos.current.y;
                setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
              } else if (isDrawing) {
                handleCanvasInteraction(e);
              }
              lastMousePos.current = { x: e.clientX, y: e.clientY };
            }}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
        <div style={{ maxWidth: '600px', width: '100%', display: mode === 'HashLife' ? 'block' : 'none' }}>
          <h3>HashLife Long-term Computation</h3>
          <p>Skip massive numbers of generations instantly using the HashLife algorithm.</p>

          <section className="control-group" style={{ marginBottom: '20px' }}>
              <label>RLE Pattern Input / Export</label>
            <textarea
              value={rleInput}
              onChange={e => setRleInput(e.target.value)}
              style={{ width: '100%', height: '120px', backgroundColor: '#333', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '8px', fontFamily: 'monospace' }}
            />
              <div className="button-row">
                <button onClick={loadRleToHashLife} disabled={!workerReady}>Load to HashLife</button>
                <button onClick={loadRleToWebGPU}>Load to WebGPU</button>
              </div>
              <button className="secondary" onClick={exportFromWebGPU} style={{ marginTop: '8px' }}>Export from WebGPU</button>
          </section>

          <div className="control-group">
            <div className="label-row">
              <span>Step: 2^{exponent}</span>
              <span>{Math.pow(2, exponent).toLocaleString()} gen</span>
            </div>
            <input type="range" min="0" max="64" value={exponent} onChange={e => setExponent(parseInt(e.target.value))} />
            <button onClick={handleJump} disabled={!workerReady} style={{ marginTop: '10px' }}>Jump!</button>
          </div>

          {hashLifeStats && (
            <div className="stats-panel" style={{ marginTop: '20px' }}>
              <div>Gen: {hashLifeStats.gen}</div>
              <div>Pop: {hashLifeStats.pop}</div>
              <div>Time: {hashLifeStats.time.toFixed(2)} ms</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
