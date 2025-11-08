#!/bin/bash
# Script to run benchmarks and save results to a file

# Create benchmarks directory if it doesn't exist
mkdir -p benchmark_results

# Get timestamp for the filename
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RESULT_FILE="benchmark_results/bench_${TIMESTAMP}.txt"

echo "Running benchmarks..."
echo "Results will be saved to: $RESULT_FILE"
echo ""

# Run benchmarks and save to file
cargo bench --bench eq_proving 2>&1 | tee "$RESULT_FILE"

echo ""
echo "Benchmarks complete. Results saved to: $RESULT_FILE"

# Also create a "latest" symlink
ln -sf "bench_${TIMESTAMP}.txt" benchmark_results/latest.txt

echo "Latest results also available at: benchmark_results/latest.txt"
