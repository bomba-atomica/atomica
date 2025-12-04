use halo2_proofs::{
    circuit::{Layouter, SimpleFloorPlanner, Value},
    halo2curves::bn256::Fr,
    plonk::{Advice, Circuit, Column, ConstraintSystem, Error, Expression, Selector, TableColumn},
    poly::Rotation,
};

#[derive(Clone, Copy)]
pub struct AuctionConfig {
    pub bid: Column<Advice>,
    pub is_valid: Selector,
    pub check_range: Selector, // Selector to enable lookup
    pub range_table: TableColumn,
    pub instance: Column<halo2_proofs::plonk::Instance>,
}

#[derive(Default)]
pub struct AuctionCircuit {
    pub bids: Vec<Value<Fr>>,
    pub reserve_price: Value<Fr>,
    pub winner_idx: Option<usize>,
}

impl Circuit<Fr> for AuctionCircuit {
    type Config = AuctionConfig;
    type FloorPlanner = SimpleFloorPlanner;

    fn without_witnesses(&self) -> Self {
        Self::default()
    }

    fn configure(meta: &mut ConstraintSystem<Fr>) -> Self::Config {
        let bid = meta.advice_column();
        let instance = meta.instance_column();
        let is_valid = meta.selector();
        let check_range = meta.complex_selector(); // Use complex selector for lookups
        let range_table = meta.lookup_table_column();

        meta.enable_equality(bid);
        meta.enable_equality(instance);

        // Lookup: value in advice column must be in range_table
        meta.lookup("range check", |meta| {
            let s = meta.query_selector(check_range);
            let value = meta.query_advice(bid, Rotation::cur());
            vec![(s * value, range_table)]
        });

        AuctionConfig {
            bid,
            is_valid,
            check_range,
            range_table,
            instance,
        }
    }

    fn synthesize(
        &self,
        config: Self::Config,
        mut layouter: impl Layouter<Fr>,
    ) -> Result<(), Error> {
        // 1. Load Lookup Table (0..256)
        layouter.assign_table(
            || "range table",
            |mut table| {
                for i in 0..256 {
                    table.assign_cell(
                        || "range",
                        config.range_table,
                        i,
                        || Value::known(Fr::from(i as u64)),
                    )?;
                }
                Ok(())
            },
        )?;

        let winner_val = layouter.assign_region(
            || "auction logic",
            |mut region| {
                // 2. Assign Bids
                let mut assigned_bids = Vec::new();
                for (i, bid_val) in self.bids.iter().enumerate() {
                    let cell = region.assign_advice(
                        || format!("bid {}", i),
                        config.bid,
                        i,
                        || *bid_val,
                    )?;
                    assigned_bids.push(cell);
                }

                // 3. Identify Winner
                let win_idx = self.winner_idx.unwrap_or(0);
                let winner_bid = assigned_bids[win_idx].clone();
                let winner_val = self.bids[win_idx];

                // 4. Check Winner >= Reserve
                // We need to calculate diff = winner - reserve
                // And check if diff is in table.
                // We need to assign `diff` to the advice column to lookup it.
                // Let's use offset = bids.len() for temp assignments.
                let mut offset = self.bids.len();

                let reserve = self.reserve_price;
                let diff_reserve = winner_val - reserve;
                
                config.check_range.enable(&mut region, offset)?;
                region.assign_advice(
                    || "winner - reserve",
                    config.bid,
                    offset,
                    || diff_reserve,
                )?;
                offset += 1;

                // 5. Check Winner >= All Other Bids
                for (i, bid) in self.bids.iter().enumerate() {
                    if i == win_idx { continue; }
                    
                    let diff = winner_val - *bid;
                    config.check_range.enable(&mut region, offset)?;
                    region.assign_advice(
                        || format!("winner - bid {}", i),
                        config.bid,
                        offset,
                        || diff,
                    )?;
                    offset += 1;
                }

                Ok(winner_bid)
            },
        )?;

        Ok(())
    }
}
