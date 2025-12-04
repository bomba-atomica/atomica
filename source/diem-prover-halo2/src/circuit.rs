use halo2_proofs::{
    circuit::{Layouter, SimpleFloorPlanner, Value},
    halo2curves::bn256::Fr,
    plonk::{Advice, Circuit, Column, ConstraintSystem, Error, Expression, Selector},
    poly::Rotation,
};

#[derive(Clone, Copy)]
pub struct EquivalenceConfig {
    pub advice: Column<Advice>,
    pub s_eq: Selector,
}

#[derive(Default)]
pub struct EquivalenceCircuit {
    pub private_input: Value<Fr>,
}

impl Circuit<Fr> for EquivalenceCircuit {
    type Config = EquivalenceConfig;
    type FloorPlanner = SimpleFloorPlanner;

    fn without_witnesses(&self) -> Self {
        Self::default()
    }

    fn configure(meta: &mut ConstraintSystem<Fr>) -> Self::Config {
        let advice = meta.advice_column();
        let s_eq = meta.selector();

        meta.enable_equality(advice);

        meta.create_gate("equivalence", |meta| {
            let s = meta.query_selector(s_eq);
            let advice_val = meta.query_advice(advice, Rotation::cur());
            let constant = Fr::from(42);

            // Constraint: s * (advice - 42) = 0
            vec![s * (advice_val - Expression::Constant(constant))]
        });

        EquivalenceConfig { advice, s_eq }
    }

    fn synthesize(
        &self,
        config: Self::Config,
        mut layouter: impl Layouter<Fr>,
    ) -> Result<(), Error> {
        layouter.assign_region(
            || "equivalence check",
            |mut region| {
                config.s_eq.enable(&mut region, 0)?;

                region.assign_advice(
                    || "private input",
                    config.advice,
                    0,
                    || self.private_input,
                )?;

                Ok(())
            },
        )
    }
}
