# Atomica Call Auction Simulator

A static single-page application that simulates the Atomica daily call auction system with time-lock encryption and sequential clearing.

## Features

### 1. **Bidder Tab**
- **Funding Section:**
  - Set your USDC balance
  - Quick funding buttons (50K, 100K, 250K, 500K)
  - View auction information and rules
- **Bidding Section:**
  - Place bids on 10 different assets (DOGE, LINK, UNI, DOT, ATOM, AVAX, MATIC, SOL, BTC, ETH)
  - Each bid includes:
    - Units to buy
    - Maximum price per unit (USDC)
  - Real-time calculation of total bid amounts
  - Smart bidding allowed (bid more than balance with 5% fee on shortfall)

### 2. **Seller Tab**
- List assets for sale in the auction
- For each asset:
  - Specify units to sell
  - Set optional reserve price (minimum price)
- **Reserve Price Mechanics:**
  - Only charged if asset does NOT clear
  - Fee based on RMS delta from clearing price
  - Revenue distributed to buyers whose bids cleared
  - No fee if asset sells successfully

### 3. **Results Tab**
- Run auction simulation with fixture test data
- **Buyer Results:**
  - Assets won
  - Total amount spent
  - Remaining balance
  - Smart bidding fees paid
  - Detailed per-asset breakdown (wins/losses with reasons)
- **Seller Results:**
  - Assets sold
  - Total revenue earned
  - Reserve fees paid (if any)
  - Detailed per-asset breakdown (sold/unsold with reasons)
- Visualize supply/demand curves for each cleared asset
- See exactly how clearing prices were determined

## How It Works

### Auction Timeline

The auction follows a specific daily schedule (all times in EST):

1. **24 hours before bidding**: Encryption key is created using time-lock encryption (drand)
2. **Anytime before deadlines**: Users can submit bids or list assets for sale
3. **12:00 PM (noon)**: Asset listing deadline - no new assets accepted after this time
4. **12:30 PM**: Bid submission deadline - no new bids accepted after this time
5. **12:30 PM**: Simultaneous reveal - all encrypted bids and listings decrypt
6. **After reveal**: Sequential clearing and settlement

### Sequential Clearing Algorithm

After the reveal at 12:30 PM, assets clear in order from smallest to biggest market:
- DOGE → LINK → UNI → DOT → ATOM → AVAX → MATIC → SOL → BTC → ETH

### Smart Bidding Mechanism

Since all bids reveal simultaneously, bidders can make their capital more efficient by bidding on multiple assets with total bids exceeding their balance.

- Users can bid more than their balance
- If `total_bids > balance`, a 5% fee is charged on the budget shortfall (`total_bids - balance`) upfront (in USDC)
- Net budget = balance - fee
- During sequential clearing:
  - If your net budget runs out, remaining wins are forfeited
  - This creates capital efficiency in simultaneous reveal auctions while preventing abuse

### Market Simulation

The simulator generates realistic fixture data for each asset:
- Multiple buy orders from other participants
- Multiple sell orders from sellers
- Supply and demand curves that intersect at clearing prices
- Each run generates new random market conditions

### Price Discovery

For each asset, the system:
1. Combines your bid with fixture market data
2. Sorts buy orders (highest to lowest) and sell orders (lowest to highest)
3. Builds cumulative supply and demand curves
4. Finds the intersection point (clearing price)
5. Determines if your bid clears
6. Checks if you have sufficient remaining budget

## Usage

### Running Locally

Simply open `index.html` in a modern web browser:

```bash
open source/web/index.html
```

Or serve it with a local web server:

```bash
cd source/web
python3 -m http.server 8000
# Open http://localhost:8000 in your browser
```

### Deployment to GitHub Pages

The simulator is automatically deployed to GitHub Pages on every commit to `main` that changes files in `source/web/`.

**Setup Instructions:**

1. Go to your repository Settings → Pages
2. Under "Build and deployment", select:
   - **Source**: GitHub Actions
3. Commit changes to `source/web/` on the `main` branch
4. The GitHub Actions workflow will automatically deploy

**Manual Deployment:**

You can also trigger deployment manually:
1. Go to Actions tab in your repository
2. Select "Deploy to GitHub Pages" workflow
3. Click "Run workflow"

Once deployed, the simulator will be available at:
`https://<username>.github.io/<repository-name>/`

### Using the Simulator

1. **As a Buyer** (Bidder tab)
   - Fund your account with USDC (e.g., 100,000)
   - Place bids on assets you want to buy
   - Enter units and max price per unit (in USDC)
   - Watch your total bid amount and smart bidding fee warnings
   - Click "Submit Encrypted Bids"

2. **As a Seller** (Seller tab)
   - List assets you want to sell
   - Enter units to sell for each asset
   - Optionally set reserve prices (minimum acceptable price)
   - Understand that reserve fees only apply if asset doesn't sell
   - Click "Lock Assets for Auction"

3. **View Results** (Results tab)
   - Click "Run Auction Simulation"
   - See buyer results: which assets you won, how much you spent
   - See seller results: which assets sold, revenue earned, reserve fees
   - Examine demand/supply curves for cleared assets
   - Understand why some bids/sales didn't clear

4. **Try Again**
   - Click "Reset & Start Over" to clear everything
   - Market conditions will regenerate with new fixture data
   - You can play both buyer and seller roles simultaneously

## Technical Stack

- **Tailwind CSS**: Utility-first styling via CDN
- **Alpine.js**: Reactive UI state management
- **Chart.js**: Supply/demand curve visualization
- **Vanilla JavaScript**: Auction clearing algorithm

## Implementation Details

### Clearing Price Calculation

The `calculateClearingPrice()` function:
- Builds cumulative demand curve from sorted buy orders
- Builds cumulative supply curve from sorted sell orders
- Finds the price where demand meets or exceeds supply
- Returns clearing price and units cleared

### Sequential Budget Tracking

The `runSimulation()` function:
- Processes assets in predetermined order
- Tracks remaining budget across auctions
- Forfeits wins when budget exhausted
- Calculates smart bidding fees upfront

### Reserve Price Fees

For sellers who set reserve prices:
- Fee only charged if asset does NOT sell (clearing price < reserve)
- Simplified calculation: 5% of RMS delta between clearing and reserve prices
- Example: Reserve = 100, Clearing = 80, Units = 10
  - RMS Delta = |100 - 80| = 20
  - Fee = 20 × 10 × 0.05 = 10 USDC
- Fees distributed to buyers whose bids cleared (simulated in fixture data)
- No fee if asset sells successfully

### Fixture Data Generation

The `generateMarketData()` function creates realistic market conditions:
- Base prices for each asset (from realistic market data)
- Multiple buyers and sellers per asset
- Price volatility and supply amounts scaled to market size
- Demand multipliers to simulate different liquidity levels

## Design Principles

Following the product design document:

1. **Sequential Clearing**: Smallest → biggest market
2. **Smart Bidding**: 5% fee on shortfall enables capital-efficient bidding across multiple assets
3. **Budget Exhaustion**: Remaining wins forfeited when funds run out
4. **Uniform Pricing**: All buyers pay the same clearing price
5. **Reserve Price Economics**: Sellers pay fees only when assets don't clear
6. **Transparent Results**: Full visibility into why bids/sales succeeded or failed
7. **Dual-Role Support**: Users can act as both buyer and seller simultaneously

## Future Enhancements

Potential additions:
- User-defined clearing priority (v2 feature consideration)
- Adjustable smart bidding fee percentage
- More sophisticated reserve fee calculation (actual RMS formula)
- Distribution simulation showing how reserve fees go to winning buyers
- More realistic fixture data based on real market history
- Animation of sequential clearing process
- Export results to CSV/JSON
- Multi-day simulation with balance carryover
- Integration with actual smart contract data
- Visual indicators for which orders in the chart are user's orders
- Partial fill simulation for sellers (when demand < supply)
