import init, { HashLife } from "../../wasm-life/pkg/wasm_life";

let hashlife: HashLife | null = null;

self.onmessage = async (e) => {
    const { type, exponent, rle } = e.data;

    if (type === "init") {
        await init();
        if (rle) {
            hashlife = HashLife.from_rle(rle);
        } else {
            hashlife = new HashLife();
        }
        self.postMessage({ type: "ready" });
    } else if (type === "step") {
        if (!hashlife) return;
        const start = performance.now();
        hashlife.step(exponent);
        const end = performance.now();

        self.postMessage({
            type: "step_result",
            generation: hashlife.get_generation(),
            population: hashlife.get_population(),
            duration: end - start
        });
    }
};
