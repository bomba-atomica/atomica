# Secondary Auctions Alongside Continuous Markets

## Overview

This document catalogs asset classes where **periodic auctions aggregate secondary sellers** while **continuous markets operate simultaneously**. This is distinct from primary issuance auctions (like Treasury auctions or IPOs) followed by continuous secondary markets.

The key criterion: **The same asset from secondary holders can be sold via both periodic batching AND continuous trading.**

---

## Table of Contents

1. [Equity Markets](#equity-markets)
2. [Precious Metals](#precious-metals)
3. [Industrial Metals](#industrial-metals)
4. [Energy Commodities](#energy-commodities)
5. [Electricity Markets](#electricity-markets)
6. [Environmental Markets](#environmental-markets)
7. [Collectibles & Art](#collectibles--art)
8. [Specialty Commodities](#specialty-commodities)
9. [Summary Comparison](#summary-comparison)

---

## Equity Markets

### **Stock Exchange Call Auctions** ⭐⭐⭐⭐⭐

**The premier example of periodic secondary auctions alongside continuous trading.**

#### Opening Auctions
- **Frequency**: Daily, before market open
- **Mechanism**: Call auction batches all orders accumulated overnight and pre-market
- **Purpose**: Price discovery for opening price; reduces overnight gap volatility
- **Volume**: Significant liquidity concentration at market open

#### Closing Auctions
- **Frequency**: Daily, at market close (typically last 5 minutes of trading day)
- **Mechanism**: Continuous trading halts; orders batched for single-price auction
- **Volume Statistics**:
  - **US Markets**: 7.5% of daily volume (2018), up from 3.1% (2010)
  - **European Markets**: 25-41% of value traded executes at close (varies by exchange; see detailed analysis below)
  - **Pattern**: Lower liquidity markets show higher auction participation
- **Participants**: Institutional investors, index funds rebalancing, retail traders
- **Price Determination**: Maximizes executable volume at single clearing price

#### Intraday Call Auctions
- **Triggered By**: Volatility halts, news announcements, order imbalances
- **Purpose**: Pause continuous trading to allow order aggregation during uncertainty
- **Examples**: Circuit breaker auctions, news-driven halts

#### European Periodic Batch Auctions (Post-MiFID II)
- **Introduction**: 2018 (Cboe first mover in 2015)
- **Frequency**: Sub-second to several-second intervals
- **Market Share**: >4% of monthly on-exchange activity
- **Leader**: Cboe (~80% of periodic auction volume)
- **Rationale**: Reduce high-frequency trading advantages; batch orders to improve execution quality
- **Academic Support**: Proposed by Budish et al. as "frequent batch auctions" to address latency arbitrage

#### Key Characteristics
- **Same Asset**: Identical shares trade in both auctions and continuous sessions
- **Same Day**: Auctions and continuous trading occur within single trading day
- **Concurrent Availability**: Traders choose between submitting to auction or continuous market
- **Secondary Nature**: All trades are secondary market (no new issuance)
- **Price Discovery**: Auctions provide benchmark prices (especially close); continuous market provides intraday liquidity

#### Benefits of Dual Structure
- **Liquidity Concentration**: Batching orders at specific times improves depth
- **Reduced Adverse Selection**: Less risk of being picked off by fast traders in auctions
- **Price Efficiency**: Lower noise in auction prices vs. continuous trading
- **Flexibility**: Investors choose venue based on urgency, size, and information

#### Academic Research Findings
- Call auctions exhibit lower information asymmetry costs
- Continuous markets have smaller bid-ask spreads but higher volatility
- Closing auctions associated with better price discovery than final continuous trades
- Trade-off between spread (favors continuous) and depth (favors auction)

---

## Precious Metals

### **Gold & Silver (LBMA)** ⭐⭐⭐⭐

#### Periodic Auctions
- **Platform**: LBMA electronic auctions via ICE Benchmark Administration
- **Frequency**:
  - Gold: 10:30 AM and 3:00 PM London time (twice daily)
  - Silver: 12:00 PM London time (once daily)
- **Asset**: Spot, unallocated loco London gold/silver
- **Mechanism**: Electronic auction with algorithm determining price based on market conditions and auction activity
- **Output**: LBMA Gold Price AM/PM and LBMA Silver Price (global benchmarks)
- **Settlement**: US dollars
- **Purpose**: Benchmark for ETFs, OTC swaps, wholesale transactions

#### Continuous OTC Market
- **Hours**: 8:00 AM - 4:30 PM London time (continuous dealer trading)
- **Structure**: Over-the-counter wholesale market among LBMA members
- **Oversight**: Bank of England
- **Scale**: Largest and oldest financial market for gold globally
- **Flexibility**: Tailor-made services (variable quantities, qualities, delivery locations, value dates)
- **Participants**: LBMA member dealers providing two-way quotes

#### Market Dynamics
- **Concurrent Operation**: OTC trading continues throughout the day; auctions set benchmarks at specific times
- **Price Relationship**: Auction benchmarks used to value OTC transactions, ETFs, and derivatives
- **Liquidity**: OTC market provides continuous liquidity; auctions provide transparent reference prices
- **Historical**: Gold fixing dates to 1919; modernized to electronic auctions in 2015

---

### **Platinum & Palladium (LPPM)** ⭐⭐

#### Periodic Auctions
- **Platform**: LMEbullion electronic system
- **Frequency**: Twice daily (9:45 AM and 2:00 PM London time)
- **History**: London Platinum Quotation introduced 1973; expanded to full fixings 1989
- **Mechanism**: Automated price-display auctions; traders indicate interest at potential execution price
- **Tolerance**: Price confirmed if all participants' interest within permitted tolerance
- **Future**: LME announced discontinuation of these auctions mid-2026

#### Continuous Markets
- **Evidence**: Limited explicit documentation of parallel continuous OTC trading
- **Structure**: Similar to gold/silver but less developed
- **Assessment**: Historically fixing-dominant market

---

## Industrial Metals

### **Copper & Base Metals (LME)** ⭐⭐⭐⭐⭐

**One of the most sophisticated dual-market structures.**

#### The Ring (Open Outcry Periodic Trading)
- **Format**: Open outcry trading floor in London
- **Schedule**: 11:40 AM - 5:00 PM London time
- **Structure**: Each metal traded in 5-minute sessions
- **Participants**: Only LME Category 1 "Ring Members"
- **Purpose**: Price discovery; establish official settlement prices
- **Historical**: Last open-outcry exchange in Europe; dates to 1877
- **Status**: Temporarily closed March 2020 (COVID); reopened September 2021 after member resistance

#### LMEselect (24/7 Electronic Trading)
- **Launch**: February 2001
- **Platform**: FIX-based electronic trading
- **Hours**: 24 hours per day
- **Volume**: Handles majority of total LME business
- **Access**: Broader participant base than Ring

#### Inter-Office Telephone Market
- **Hours**: 24-hour OTC trading
- **Format**: Bilateral dealer-to-dealer
- **Integration**: Runs concurrently with Ring and LMEselect

#### Concurrent Operations
- **Critical**: All three venues (Ring, electronic, telephone) operate **simultaneously**
- **Arbitrage**: Price convergence maintained across venues
- **Official Price**: LME Official Price derived from Ring trading; used globally as benchmark
- **Function**: Ring = price discovery; electronic = volume execution; telephone = customization

#### Market Significance
- **Global Benchmark**: LME prices are reference for physical copper contracts worldwide
- **Volume**: Despite small physical copper associated with contracts, prices dominate global pricing
- **Secondary Markets**: Extensive trading of existing positions; limited physical delivery

---

## Energy Commodities

### **Crude Oil - Brent Complex** ⭐⭐⭐⭐

#### Platts Market on Close (MOC) Window
- **Timing**: Precisely 16:30:00 London time
- **Platform**: Platts (S&P Global) assessment process
- **Format**: Structured price assessment with transparent submission window
- **Output**: Dated Brent benchmark price
- **Inputs**: Bids, offers, expressions of interest, confirmed trades
- **Methodology**: Real-time publication during assessment process
- **Purpose**: Establish daily benchmark for physical Brent crude

#### Continuous Markets

**ICE Brent Futures**:
- **Hours**: 24-hour electronic trading (Intercontinental Exchange)
- **History**: Originally London IPE open outcry (1988); moved to ICE electronic (2005)
- **Settlement**: Financially settled or deliverable via Exchange of Futures for Physicals (EFP)
- **Liquidity**: Extremely high volume; global benchmark

**Physical Forward Market**:
- **Products**: Dated Brent, Cash Brent, Contracts for Differences (CfDs), Dated-to-Frontlines (DFLs)
- **Secondary Trading**: "Each dated cargo often traded more than once as it makes its way to delivery"
- **Participants**: Producers, refiners, traders
- **Nature**: Bilateral OTC continuous trading

#### Market Structure
- **Brent Complex**: Integration of physical spot, forward, and financial derivatives
- **Price Discovery**: MOC window provides daily benchmark; continuous futures provide real-time pricing
- **Secondary Re-trading**: Active secondary market for physical cargoes between initial sale and delivery
- **Derivatives**: Financially settled derivatives based on Brent benchmark trade continuously

---

### **Iron Ore (Platts IODEX)** ⭐⭐⭐

#### Platts Iron Ore Index (IODEX)
- **Launch**: June 2, 2008 (first daily seaborne iron ore assessment)
- **Assessment**: Daily tracking "all day long"; structured MOC process at close
- **Methodology**: Considers all seaborne spot market information
- **Critical**: **"Platts does consider secondary transactions"** in pricing assessments
- **Inputs**: Bilateral negotiations, brokerage platforms, tenders, MOC bids/offers
- **Transparency**: MOC allows participants to submit firm, named bids/offers published in real-time

#### Continuous Markets
- **Bilateral Negotiations**: OTC continuous trading between miners, traders, steelmakers
- **Brokerage Platforms**: Electronic platforms for iron ore trading
- **Tenders**: Periodic but non-synchronized competitive bids
- **Futures**: CME continuous trading (Iron Ore 62% Fe CFR China futures)

#### Market Evolution
- **Historical**: Replaced annual negotiated pricing in 2010
- **Adoption**: IODEX became most-used spot price index after 2010 breakdown
- **Usage**: Long-term contracts, spot deals, financial derivatives all reference IODEX
- **Global**: Used by steelmakers, traders, mining companies worldwide

---

## Electricity Markets

### **European Power Markets (EPEX SPOT)** ⭐⭐⭐⭐⭐

**Among the clearest examples of re-tradeable positions across auctions and continuous venues.**

#### Day-Ahead Auctions
- **Frequency**: Once per day (blind auction)
- **Format**: All participants submit bids/offers simultaneously
- **Clearing**: Single clearing price per delivery hour
- **Purpose**: Primary price discovery for next-day delivery
- **Geography**: Germany/Austria, France, Switzerland, and other European markets

#### Intraday Auctions
- **Launch**: 2014 (Germany pioneered 15-minute contracts)
- **Frequency**: Multiple times per day
- **Purpose**: Pool liquidity at specific times for same-day/next-day delivery
- **Volume**: >16 TWh traded in 2023 across 13 countries
- **Products**: 15-minute, 30-minute, and hourly contracts

#### Continuous Intraday Market
- **Hours**: 24/7 continuous trading without exceptions
- **Format**: Pay-as-bid order book; trades priced individually
- **Purpose**: Fine-tune positions, arbitrage, respond to forecast changes
- **Participants**: Balance Responsible Parties adjusting positions

#### Critical Feature: Re-trading
- **Explicit Secondary Trading**: "A position secured in day-ahead or intraday auctions can subsequently be traded several times as prices fluctuate on the continuous intraday market"
- **Non-physical Trading**: Results in "many multiples of a battery's stored power being traded for a single period"
- **Arbitrage**: Same MWh can be bought in auction, then resold continuously before delivery

#### Academic Debate
- **Research Topic**: Ongoing debate whether frequent auctions or continuous trading superior for intraday markets
- **Findings**:
  - Continuous trading: Lower costs close to delivery, better for large volumes
  - Auctions: Lower liquidity costs overall, less noisy price signals, better grid alignment
  - Trade-offs vary by market thickness, timing, and volume

---

## Environmental Markets

### **EU Emissions Trading System (EU ETS)** ⭐⭐⭐⭐

#### Primary Market Auctions
- **Platform**: EEX (European Energy Exchange)
- **Frequency**: Daily auctions
- **Format**: Uniform price, single-round, sealed-bid
- **Participants**: ~30 entities bid (typically <15 successful on any day)
- **Volume**: 57% of allowances auctioned over 2021-2030 period
- **Purpose**: Primary allocation of new allowances by member states

#### Secondary Market - Continuous Trading
- **Venues**: EEX, ICE, ENDEX, Nasdaq (ICE ~80% of volume)
- **Products**: Spot, futures, options, forward contracts
- **Trading**: Exchange-based and over-the-counter
- **Volume**: **€781 billion in 2024** (vast majority of total trading)
- **Scale**: "Vast majority of trading takes place on secondary market"
- **Legal Status**: EU allowances classified as financial instruments since 2018

#### Market Characteristics
- **Dual Structure**: Daily primary auctions + massive continuous secondary market
- **Participant Divergence**: Few auction participants vs. hundreds of active secondary traders
- **Liquidity**: Secondary market provides continuous price discovery and risk management
- **Derivatives**: Extensive futures/options trading for hedging and speculation

---

### **Renewable Energy Certificates (RECs) - India** ⭐⭐

#### Periodic Auctions
- **Frequency**: Bi-monthly (2nd and last Wednesday of each month)
- **Hours**: 13:00-15:00 Hrs (last Wednesday schedule)
- **Platform**: Power Exchanges (Indian Energy Exchange, others)
- **Format**: Double-sided closed bidding auction with price-prorata base allocation
- **Purpose**: REC trading for compliance and voluntary markets

#### Continuous Markets
- **Global Platforms**: Xpansiv CBL spot market (North America/international)
- **Products**: ~100 global voluntary and compliance RECs
- **Trading**: Continuous exchange platform + post-trade settlement for private deals
- **Geography**: Different regions prefer different mechanisms (India = periodic; US/Europe = continuous)

---

## Collectibles & Art

### **eBay Trading Cards** ⭐⭐⭐

#### Timed Auctions
- **Format**: Individual item auctions with predetermined end times
- **Duration**: Typically 7-10 days (often Thursday start for two weekend exposure)
- **Mechanism**: Ascending bid auction
- **Innovation**: Testing extended bidding (2-minute extension if bid in final 2 minutes)
- **Scale**: Dominant platform - $245M of $305M total online card sales (June 2020)

#### Buy It Now (Continuous Listings)
- **Format**: Fixed-price listings available 24/7
- **Duration**: Until sold or seller removes
- **Nature**: Continuous marketplace, instant purchase
- **Flexibility**: Sellers can offer both auction and BIN simultaneously

#### Market Dynamics
- **Seller Choice**: Same seller, same secondary cards can be listed via either mechanism
- **Price Discovery**: Auctions establish market prices; BIN provides immediate liquidity
- **Dual Listing**: Some items listed as auction with BIN option for immediate purchase

---

### **Art Market (Christie's, Sotheby's)** ⭐⭐⭐

#### Periodic Auctions
- **Schedule**: Seasonal calendar (major sales in May, November, etc.)
- **Format**: Live auctions with auctioneer, absentee bids, phone bidding, online bidding
- **Volume**: 83-85% of auction house revenues (Christie's/Sotheby's)
- **Prestige**: High-value lots, public price discovery, competitive bidding

#### Private Sales (Continuous Market)
- **Format**: Year-round discrete negotiations between buyers and sellers
- **Growth**: Christie's private sales +24% (2018-2019) to $811M (15% of total sales)
- **Sotheby's**: $990M private sales (17% of revenue in 2019)
- **Services**: "Works discreetly and seamlessly... independent of auction calendar"

#### Benefits of Private Sales
- **Discretion**: Confidential transactions
- **Speed**: Faster than waiting for auction calendar
- **Price Control**: Negotiated prices vs. public auction uncertainty

#### Market Evolution
- **Blurring Lines**: "Boundaries between auction houses, dealer, and gallery are blurring"
- **Dominance**: Sotheby's and Christie's control ~50% of auction sector, ~67% of private sales
- **Strategy**: Auction houses increasingly acting as dealers with continuous sales operations

---

## Specialty Commodities

### **Diamonds - De Beers System** ⭐⭐⭐⭐

#### Periodic Primary Sales ("Sights")
- **Frequency**: 10 times per year
- **Locations**: Botswana, Namibia, South Africa
- **Process**: Sightholders inspect allocations, decide whether to purchase
- **Volume**: ~90% of De Beers production by value
- **Participants**: Limited number of approved "Sightholders"

#### De Beers Auctions
- **Launch**: 2008 (first online international auction)
- **Frequency**: Regular online auctions
- **Volume**: ~10% of De Beers production
- **Participants**: Both Sightholders and Non-Sightholders registered

#### Secondary Market (Continuous Trading)
- **Structure**: Bilateral OTC trading between sight holders, manufacturers, traders
- **Scale**: ~5,000 individual manufacturers must source from secondary market
- **Price Discovery**: Premiums/discounts to sight prices based on supply/demand
- **Recent Activity**: 5% premiums on secondary market for larger goods (after long period of no premium)
- **Rationale**: "Mining companies usually sell to limited number of regular clients, but there are as many as 5,000 individual manufacturers... must source their rough stones from somewhere"

#### Market Dynamics
- **Allocation Scarcity**: Limited sight allocation forces secondary market development
- **Price Benchmarking**: "Nearly all diamond producers apply results of their tenders/auctions to rough prices at traditional sights"
- **Volatility**: "Volatility has always been part of secondary rough market, reflected in premiums sightholders received"

---

### **Tea Auctions (Kolkata, Mombasa)** ⭐⭐

#### Periodic Auctions
- **Mombasa**: Weekly (Tuesday main grades, Monday secondary grades)
- **Kolkata**: Weekly (first auction held 1861)
- **Volume**: ~14 million kg offered weekly at Mombasa, ~11 million sold
- **Geography**: Mombasa is multi-origin center (10 countries: Kenya, Uganda, Tanzania, Rwanda, Burundi, DRC, Malawi, Madagascar, Mozambique, Ethiopia)
- **Function**: Primary price discovery; establishes global price levels and differentials

#### Private Treaties (Continuous Element)
- **Format**: Brokers sell directly to buyer members outside auction
- **Relationship**: "Complementary feature to weekly Monday auctions"
- **Nature**: Bilateral negotiations, not formalized exchange

#### Market Characteristics
- **Auction-Dominant**: Periodic auctions are primary mechanism
- **Limited Continuous**: Private treaties exist but less documented/formalized
- **Price Reference**: Auction prices guide private treaty negotiations
- **Assessment**: Weaker example - limited true continuous secondary market

---

### **Livestock - Cattle Auctions** ⭐

#### Physical Auctions
- **Frequency**: Weekly or bi-weekly at auction barns/markets
- **Format**: Live animal auctions; ascending bid
- **Participants**: Producers, feedlots, buyers
- **Volume**: Significant portion of physical cattle sales (especially smaller producers)

#### Continuous/Bilateral Markets
- **Private Treaty**: Direct negotiations between producers and packers
- **Formula Pricing**: Base price adjusted by grid premiums/discounts
- **Forward Contracts**: Agreed price for future delivery (e.g., 650 lb steers sold as 800 lb for delivery in 75 days)

#### Futures Markets (Different Asset)
- **Products**: Live Cattle, Feeder Cattle (CME)
- **Nature**: Financial contracts, not physical cattle
- **Limitation**: Futures are different instrument; not same asset as physical auctions

#### Assessment
- **Weak Example**: Physical auctions vs. bilateral sales both exist, but unclear if same cattle trade in both venues
- **Futures Separate**: Futures market is financial risk management, not secondary physical trading

---

## Summary Comparison

### **Tier 1: Strongest Examples (Clear Secondary Auctions + Continuous)** ⭐⭐⭐⭐⭐

1. **Equity Markets - Call Auctions**
   - Same shares, same day, explicit secondary trading
   - 7.5% US volume at close, 25% European value at close
   - Opening, closing, and intraday volatility auctions
   - European periodic batch auctions (>4% on-exchange volume)

2. **Electricity (EPEX Intraday)**
   - Explicit re-trading: positions from auctions resold continuously
   - "Non-physical trading" of same MWh multiple times
   - Day-ahead + intraday auctions + 24/7 continuous

3. **LME Copper (Ring + Electronic)**
   - Three concurrent venues: Ring (periodic), LMEselect (24/7), telephone (24/7)
   - Ring provides official prices; electronic handles volume
   - Same contracts trade across all venues

### **Tier 2: Strong Examples** ⭐⭐⭐⭐

4. **LBMA Gold & Silver**
   - Twice-daily (gold) or daily (silver) benchmark auctions
   - Continuous OTC dealer market 8 AM-4:30 PM
   - Same unallocated loco London metal

5. **Crude Oil Brent**
   - Platts MOC window at 16:30 for daily benchmark
   - ICE futures 24-hour + physical cargo re-trading
   - "Each cargo often traded more than once"

6. **EU ETS Carbon Permits**
   - Daily primary auctions + €781B continuous secondary market
   - Vast majority of volume on continuous secondary
   - Same allowances trade both venues

7. **Diamonds (De Beers)**
   - Periodic sights (10x/year) + auctions (10% volume)
   - Active continuous secondary: 5,000 manufacturers sourcing
   - Premium/discount trading relative to sight prices

### **Tier 3: Moderate Examples** ⭐⭐⭐

8. **Iron Ore (Platts IODEX)**
   - Daily MOC assessment explicitly includes secondary transactions
   - Continuous bilateral + brokerage platforms + futures
   - Integrated price discovery mechanism

9. **Art Auctions (Christie's, Sotheby's)**
   - Periodic seasonal auctions (calendar-based)
   - Growing continuous private sales (17% Sotheby's revenue)
   - Same houses operate both mechanisms

10. **eBay Trading Cards**
    - Individual timed auctions (7-10 days) + instant Buy It Now
    - Sellers choose mechanism for same secondary items
    - Dominant platform ($245M/$305M online sales)

### **Tier 4: Weaker Examples** ⭐⭐

11. **Tea Auctions**
    - Weekly auctions (main price discovery)
    - Limited private treaty sales (complementary)
    - Auction-dominant market

12. **RECs (India)**
    - Bi-monthly auctions (2nd and last Wednesday)
    - Continuous markets more prominent in other regions
    - Fragmented global structure

13. **Platinum/Palladium**
    - Twice-daily fixings (being discontinued 2026)
    - Limited evidence of parallel continuous OTC

---

## Auction Volume Share: Liquidity and Market Structure

### **Relationship Between Liquidity and Auction Share**

A key empirical pattern: **In lower liquidity markets, periodic auctions capture a larger percentage of daily trading volume relative to continuous markets.**

### **Evidence from Equity Markets**

#### United States (High Liquidity)
- **Closing Auction Volume**: 7.5% of daily volume (2018), up from 3.1% (2010)
- **Combined Open/Close**: ~5.5% average across NYSE and Nasdaq (up from 3.6% in 2011)
- **Growth Trend**: Auction share steadily increasing but remains modest
- **Source**: Academic research on US closing auction participation

#### European Markets (Moderate-to-Low Liquidity)
European markets show **significantly higher auction participation** than US markets:

**Euronext (Multiple European Exchanges)**:
- **Standard Days**: 25% of on-book trading value executes at closing auction
- **Rebalancing Days**: 54% of on-book trading value executes at closing auction
- **Context**: Average daily value €14.0bn (standard) vs. €27.5bn (rebalancing)
- **Source**: Euronext study on index rebalancing and auction imbalance (2024-2025)

**London Stock Exchange**:
- **Closing Auction Share**: 30-40% of lit continuous trading volume
- **Growth**: Increased from ~30% (January 2018) to nearly 40% (recent data)
- **Measurement**: Closing auction volume as percentage of lit continuous trading
- **Source**: Market structure analysis, BMLL Technologies

**France (CAC 40)**:
- **Closing Auction Share**: 41% of trading at close (June 2019)
- **Context**: Blue-chip index with relatively lower intraday liquidity vs. US large caps
- **Source**: Liquidnet analysis of European auction trends

#### Cross-Market Comparison

| **Market** | **Closing Auction Volume %** | **Relative Liquidity** |
|------------|------------------------------|------------------------|
| US (NYSE/Nasdaq) | 5-7.5% | Very High |
| UK (LSE) | 30-40% | Moderate-High |
| Euronext | 25% (standard), 54% (rebalancing) | Moderate |
| France (CAC 40) | 41% | Moderate |

**Pattern**: Lower liquidity → Higher auction share

### **Why Lower Liquidity Increases Auction Share**

1. **Adverse Selection Protection**: In thinner markets, continuous trading exposes large orders to higher adverse selection risk. Auctions batch orders, reducing information leakage.

2. **Price Impact Reduction**: Lower liquidity means larger price impact in continuous markets. Auctions pool liquidity at specific times, improving execution quality for size.

3. **Institutional Behavior**: Passive funds and institutional investors concentrate trades at close for benchmarking. In lower liquidity markets, this concentration is more pronounced relative to continuous volume.

4. **Market Maker Economics**: Thin markets have wider spreads and less competitive market making. Auctions provide alternative execution venue with better pricing for larger orders.

5. **Rebalancing Concentration**: Index rebalances and portfolio adjustments create predictable liquidity events. Lower liquidity markets see even higher auction concentration during these events (e.g., 54% Euronext rebalancing days).

### **Growth Trends**

**European Markets**:
- Liquidnet projected (2019): "Closing auction volumes will continue to rise by 3-4% each year and reach 50% of all European trading activity within eight years"
- Driven by: Growth of passive investing, index fund rebalancing, benchmark-tracking strategies

**US Markets**:
- Steady growth: 3.1% (2010) → 7.5% (2018)
- Slower growth rate than Europe due to higher baseline liquidity

### **Measurement Nuances**

Different studies use different denominators:
- **On-book only**: Excludes dark pools and OTC trading
- **Lit continuous only**: Closing auction as % of lit order book (LSE 30-40%)
- **Total exchange volume**: Includes all on-exchange trading (more conservative)
- **All trading venues**: Includes MTFs, dark pools (lowest auction %)

**Key Finding**: The "25% European" figure is specific to **Euronext on-book trading on standard days**, not a universal European average across all exchanges and measurement methodologies.

### **Implications for Market Design**

1. **Liquidity Fragmentation**: As liquidity fragments across venues, auctions provide coordination mechanism
2. **Optimal Balance**: Trade-off between continuous immediacy and auction depth varies by market liquidity
3. **Regulatory Impact**: MiFID II dark pool restrictions may have increased lit auction volumes
4. **Future Trends**: Continued growth of passive investing likely to increase auction concentration further

### **Sources and References**

- Euronext (2024-2025): "Index Rebalancing and Auction Imbalance: Keen to find the Balance?"
- BMLL Technologies: "What affects closing auction volume share?"
- Aquis Exchange: "Introduction to trading mechanisms in the European equities market: Closing Auctions"
- Liquidnet (2019): "Closing Auctions To Continue To Grow" (projection to 50% within 8 years)
- Academic research: Various papers on closing auction participation and market quality effects
- Coalition Greenwich: "Stock Trading Volumes Gravitate to Open and Closing Auctions"

---

## Key Patterns & Insights

### **Why This Structure Emerges**

1. **Liquidity Concentration**: Batching orders at specific times improves market depth and reduces price impact for large orders

2. **Price Discovery**: Periodic auctions provide transparent benchmark prices used for:
   - Derivatives settlement (metals, oil, electricity)
   - Physical contract indexation
   - Portfolio valuation (ETFs, indices)
   - Regulatory reporting

3. **Flexibility vs. Certainty**:
   - Continuous markets: Immediate execution, tight spreads for small orders
   - Auctions: Better execution for large orders, less adverse selection

4. **Historical Infrastructure**: Many examples (LME ring, LBMA fixings, tea auctions) are century-old institutions adapted with modern electronic continuous markets

5. **Regulatory Drivers**:
   - MiFID II drove European periodic batch auctions
   - Exchange rules mandate opening/closing auctions
   - Benchmark regulation requires transparent price-setting

6. **Information Asymmetry**: Auctions reduce fast-trader advantages vs. continuous markets (academic research on frequent batch auctions)

### **Asset Classes with Strong Examples**

- **Equities**: Universal opening/closing auctions
- **Metals**: Historical fixing tradition (LBMA, LME)
- **Electricity**: Technical constraint of delivery timing + balancing needs
- **Environmental**: Regulatory compliance creates dual markets
- **Collectibles**: eBay-style platforms offering both mechanisms

### **Asset Classes WITHOUT This Structure**

- **Most Agricultural Commodities**: Grains, sugar, coffee, cocoa, rubber → continuous futures dominant, no clear periodic secondary auctions
- **Government Bonds**: Primary issuance auctions, but continuous secondary only (no periodic secondary auctions)
- **FX Markets**: Continuous 24-hour markets; no periodic auctions (except WM/Reuters fixes, which are benchmarks not auctions)
- **Cryptocurrencies**: Continuous 24/7 markets across exchanges

### **Critical Distinction: Primary vs. Secondary Auctions**

This document focuses on **secondary auctions** where existing asset holders can sell. We explicitly exclude:
- Treasury auctions (new issuance only)
- Spectrum auctions (initial allocation)
- IPO book-building (primary issuance)
- Carbon permit initial auctions (though EU ETS has both primary auctions and secondary continuous)

The question is: **Can the same asset be sold by secondary holders via both periodic auctions and continuous markets?**

---

## Research Applications

This dual-market structure is relevant for:

1. **Market Microstructure**: Understanding optimal trading venue design
2. **Algorithmic Trading**: Strategies spanning auction and continuous venues
3. **Price Discovery**: Role of periodic batching vs. continuous information incorporation
4. **Liquidity Provision**: Market maker strategies across dual venues
5. **Regulatory Design**: When to mandate auctions vs. allow continuous trading
6. **Blockchain/DeFi**: Applying lessons to decentralized exchange design

---

## References & Data Sources

- European equity market data: Cboe Europe, various academic papers on MiFID II periodic auctions
- Equity closing auction statistics: NYSE, academic research on closing auction participation
- LBMA precious metals: ICE Benchmark Administration, LBMA official documentation
- LME base metals: London Metal Exchange trading documentation
- Platts oil benchmarks: S&P Global Commodity Insights methodology guides
- EPEX electricity: EPEX SPOT market documentation, academic papers on intraday auctions
- EU ETS: European Environment Agency, ICE and EEX trading statistics
- Art market: Sotheby's and Christie's annual reports, art market analyses
- Diamond market: De Beers trading documentation, industry reports on secondary rough trading

---

*Last Updated: 2025-11-21*
