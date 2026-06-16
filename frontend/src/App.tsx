import { useState, useEffect, useRef } from 'react';
import initWebGPU, { WebGPULife } from '../../webgpu-life/pkg/webgpu_life';

function App() {
  const [mode, setMode] = useState<'WebGPU' | 'HashLife'>('WebGPU');
  const [exponent, setExponent] = useState(10);
  const [hashLifeStats, setHashLifeStats] = useState<{gen: string, pop: string, time: number} | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webgpuLifeRef = useRef<WebGPULife | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [workerReady, setWorkerReady] = useState(false);

  // Initialize WebGPU
  useEffect(() => {
    if (mode === 'WebGPU' && canvasRef.current) {
      const run = async () => {
        await initWebGPU();
        const life = await WebGPULife.new(canvasRef.current!, 512, 512);
        webgpuLifeRef.current = life;

        const render = () => {
          if (mode === 'WebGPU' && webgpuLifeRef.current) {
            webgpuLifeRef.current.run_frame();
            requestAnimationFrame(render);
          }
        };
        render();
      };
      run();
    }
  }, [mode]);

  // Initialize HashLife Worker
  useEffect(() => {
    const worker = new Worker(new URL('./hashlife.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      if (e.data.type === 'ready') {
        setWorkerReady(true);
      } else if (e.data.type === 'step_result') {
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

  const handleJump = () => {
    if (workerRef.current && workerReady) {
      workerRef.current.postMessage({ type: 'step', exponent });
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Life Game Studio</h1>

      <div style={{ marginBottom: '20px' }}>
        <button onClick={() => setMode('WebGPU')} disabled={mode === 'WebGPU'}>WebGPU Mode</button>
        <button onClick={() => setMode('HashLife')} disabled={mode === 'HashLife'}>HashLife Mode</button>
      </div>

      {mode === 'WebGPU' ? (
        <div>
          <h3>WebGPU Simulation (512x512)</h3>
          <canvas ref={canvasRef} width={512} height={512} style={{ border: '1px solid #ccc' }} />
        </div>
      ) : (
        <div>
          <h3>HashLife Computation</h3>
          <p>Skip generations instantly using the HashLife algorithm.</p>
          <div>
            Step size: 2^{exponent} ({Math.pow(2, exponent).toLocaleString()} generations)
            <br />
            <input
              type="range" min="0" max="60" value={exponent}
              onChange={(e) => setExponent(parseInt(e.target.value))}
            />
          </div>
          <button onClick={handleJump} disabled={!workerReady} style={{ marginTop: '10px', padding: '10px 20px' }}>
            Jump!
          </button>

          {hashLifeStats && (
            <div style={{ marginTop: '20px', padding: '15px', background: '#f0f0f0', borderRadius: '8px' }}>
              <strong>Statistics:</strong>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                <li>Generation: {hashLifeStats.gen}</li>
                <li>Population: {hashLifeStats.pop}</li>
                <li>Computation Time: {hashLifeStats.time.toFixed(2)} ms</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
