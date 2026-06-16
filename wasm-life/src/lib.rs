use wasm_bindgen::prelude::*;
use smeagol::Life;

#[wasm_bindgen]
pub struct HashLife {
    life: Life,
}

#[wasm_bindgen]
impl HashLife {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        // Initial state: glider
        let rle = "x = 3, y = 3, rule = B3/S23\nbo$2bo$3o!";
        let life = Life::from_rle_pattern(rle.as_bytes()).unwrap();
        HashLife { life }
    }

    pub fn from_rle(rle: &str) -> Result<HashLife, JsValue> {
        let life = Life::from_rle_pattern(rle.as_bytes())
            .map_err(|e| JsValue::from_str(&format!("RLE error: {:?}", e)))?;
        Ok(HashLife { life })
    }

    pub fn step(&mut self, exponent: u32) {
        self.life.set_step_log_2(exponent as u8);
        self.life.step();
    }

    pub fn get_generation(&self) -> String {
        self.life.generation().to_string()
    }

    pub fn get_population(&self) -> String {
        self.life.population().to_string()
    }
}
