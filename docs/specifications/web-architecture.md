# Web Simulator Architecture

## File Structure

```
source/web/
├── index.html        # Main HTML structure (598 lines, down from 1211)
├── app.js            # Core application logic with Alpine.js
├── components.js     # Reusable component templates
├── styles.css        # Custom CSS styles
├── README.md         # User documentation
├── DEPLOYMENT.md     # GitHub Pages deployment guide
└── ARCHITECTURE.md   # This file
```

## Technology Stack

- **Framework**: Alpine.js (reactive UI)
- **CSS**: Tailwind CSS (utility-first styling) + custom styles
- **Charts**: Chart.js (supply/demand visualization)
- **Architecture**: Single-page application (SPA) with tab-based navigation

## Key Components

### `index.html` (598 lines)
Clean, semantic HTML structure with:
- Header with balance/bid/sell summary
- Countdown timers for auction deadlines
- Tab navigation (About / Bidder / Seller / Results)
- Four main content sections corresponding to tabs

### `app.js` (24KB)
Core application state and logic:

**State Management:**
- `assets[]` - List of 10 crypto assets
- `bids{}` - User bid entries
- `sells{}` - User sell listings
- `marketData{}` - Fixture data for simulation
- `results{}` - Simulation outcomes

**Key Functions:**
- `init()` - Initialize app state and watchers
- `generateMarketData()` - Create realistic fixture orders
- `calculateClearingPrice()` - Uniform-price double auction algorithm
- `runSimulation()` - Execute sequential clearing simulation
- `drawDemandCurve()` - Render supply/demand charts

**Computed Properties:**
- `totalBids` - Sum of all bid amounts
- `smartBiddingFee` - 5% fee on budget shortfall
- `totalSells` - Count of assets listed

### `components.js` (2.1KB)
Reusable component templates (not yet fully utilized):
- `tabButton()` - Tab navigation buttons
- `assetSelector()` - Asset dropdown
- `currencyDisplay()` - Formatted currency with USDC
- `submitButton()` - Action buttons with variants
- `numberInput()` - Numeric input fields
- `infoCard()` - Colored info boxes

**Note**: These are prepared for future refactoring to reduce HTML repetition.

### `styles.css` (320 bytes)
Custom styles for:
- Chart.js canvas sizing constraints
- Chart container positioning
- Prevents chart expansion issues during scroll

## Data Flow

```
User Input (Funding/Bids/Sells)
    ↓
Alpine.js State Management
    ↓
Fixture Data Generation
    ↓
Simulation Engine
    ↓
Clearing Price Calculation (Auction Theory)
    ↓
Results Display + Charts
```

## Auction Algorithm

The `calculateClearingPrice()` function implements a **k-double auction** (k=0.5):

1. Sort buy orders descending (highest first)
2. Sort sell orders ascending (lowest first)
3. Match orders greedily while `bid >= ask`
4. Track marginal bid (lowest matched) and marginal ask (highest matched)
5. Clearing price = `0.5 * lowestMatchedBid + 0.5 * highestMatchedAsk`

This ensures:
- All buyers pay ≤ their bid
- All sellers receive ≥ their ask
- Uniform price for all participants
- Price lies between marginal bid and ask

## Sequential Clearing

Assets clear in predetermined order (smallest → biggest market):

```
DOGE → LINK → UNI → DOT → ATOM → AVAX → MATIC → SOL → BTC → ETH
```

Budget tracking:
1. Charge smart bidding fee upfront (5% of shortfall)
2. Process assets sequentially
3. Deduct cost from remaining budget
4. Forfeit wins when budget exhausted

## Chart Visualization

Supply/demand curves displayed using Chart.js:
- **X-axis**: Cumulative units (quantity)
- **Y-axis**: Price (USDC)
- **Green line**: Demand curve (stepped, descending)
- **Red line**: Supply curve (stepped, ascending)
- **Blue dashed line**: Clearing price (horizontal)

## Performance Optimizations

- **Static generation**: Fixture data generated once at init
- **No animations**: Charts set to `animation: false`
- **Fixed sizing**: Canvas containers prevent reflow
- **Lazy rendering**: Charts drawn only when needed (`$nextTick`)

## Future Enhancements

1. **Component utilization**: Refactor HTML to use `components.js` helpers
2. **Template partials**: Extract repeated HTML into templates
3. **State persistence**: LocalStorage for user data
4. **Animation**: Add transitions between states
5. **Accessibility**: ARIA labels and keyboard navigation
6. **Mobile optimization**: Touch-friendly inputs
7. **Real-time updates**: WebSocket for live auction data

## Development

### Local Testing
```bash
# Serve locally
python3 -m http.server 8000
# Open http://localhost:8000
```

### Deployment
Automatic deployment to GitHub Pages via `.github/workflows/deploy-pages.yml` when changes pushed to `main` branch.

## Code Quality

- **Separation of concerns**: HTML, CSS, JS in separate files
- **Single responsibility**: Each function has clear purpose
- **Documentation**: Comprehensive JSDoc comments
- **Maintainability**: Logical file organization
- **Readability**: Clear naming conventions

## Dependencies

**External (CDN):**
- Tailwind CSS: `https://cdn.tailwindcss.com`
- Alpine.js: `https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js`
- Chart.js: `https://cdn.jsdelivr.net/npm/chart.js`

**Local:**
- `app.js` - Core logic
- `components.js` - Component helpers
- `styles.css` - Custom styles

All dependencies loaded in HTML `<head>`.
