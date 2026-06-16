use criterion::{criterion_group, criterion_main, Criterion};
use smeagol::Life;

fn bench_life(c: &mut Criterion) {
    let mut life = Life::new();
    life.set_cell_alive(smeagol::Position::new(0, -1));
    life.set_cell_alive(smeagol::Position::new(1, 0));
    life.set_cell_alive(smeagol::Position::new(-1, 1));
    life.set_cell_alive(smeagol::Position::new(0, 1));
    life.set_cell_alive(smeagol::Position::new(1, 1));

    c.bench_function("hashlife_10^8_glider", |b| b.iter(|| {
        life.set_step_log_2(27);
        life.step();
    }));
}

criterion_group!(benches, bench_life);
criterion_main!(benches);
