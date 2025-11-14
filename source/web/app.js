/**
 * Atomica Call Auction Simulator
 * Main application logic using Alpine.js
 */

function auctionApp() {
    return {
        activeTab: 'about',
        userBalance: 0,
        fundAmount: 100000,

        // Asset list (in clearing order: smallest → biggest)
        assets: [
            { symbol: 'DOGE', name: 'Dogecoin', marketSize: 'Small' },
            { symbol: 'LINK', name: 'Chainlink', marketSize: 'Small' },
            { symbol: 'UNI', name: 'Uniswap', marketSize: 'Medium' },
            { symbol: 'DOT', name: 'Polkadot', marketSize: 'Medium' },
            { symbol: 'ATOM', name: 'Cosmos', marketSize: 'Medium' },
            { symbol: 'AVAX', name: 'Avalanche', marketSize: 'Medium' },
            { symbol: 'MATIC', name: 'Polygon', marketSize: 'Medium' },
            { symbol: 'SOL', name: 'Solana', marketSize: 'Large' },
            { symbol: 'BTC', name: 'Bitcoin', marketSize: 'Large' },
            { symbol: 'ETH', name: 'Ethereum', marketSize: 'Large' }
        ],

        // Current selections
        selectedBidAsset: 'DOGE',
        selectedSellAsset: 'DOGE',
        currentBid: { units: 0, price: 0 },
        currentSell: { units: 0, reservePrice: 0 },

        // Countdown timers
        assetDeadlineCountdown: '00:00:00',
        bidDeadlineCountdown: '00:00:00',
        countdownInterval: null,

        bids: {},
        sells: {},

        // Fixture data for simulation
        marketData: {},

        // Simulation results
        simulationRun: false,
        assetsCleared: [],
        results: {
            assetsWon: 0,
            totalSpent: 0,
            remainingBalance: 0,
            feePaid: 0,
            buyerDetails: [],
            assetsSold: 0,
            totalRevenue: 0,
            reserveFeesPaid: 0,
            sellerDetails: []
        },

        charts: {},

        init() {
            // Initialize bids and sells objects
            this.assets.forEach(asset => {
                this.bids[asset.symbol] = { units: 0, price: 0 };
                this.sells[asset.symbol] = { units: 0, reservePrice: 0 };
            });

            // Generate fixture market data
            this.generateMarketData();

            // Start countdown timers
            this.updateCountdowns();
            this.countdownInterval = setInterval(() => {
                this.updateCountdowns();
            }, 1000);

            // Watch for asset selection changes to update current inputs
            this.$watch('selectedBidAsset', (value) => {
                this.currentBid = { ...this.bids[value] };
            });

            this.$watch('selectedSellAsset', (value) => {
                this.currentSell = { ...this.sells[value] };
            });
        },

        generateMarketData() {
            const baseData = {
                'DOGE': { basePrice: 0.08, volatility: 0.02, supply: 10000, demandMultiplier: 0.8 },
                'LINK': { basePrice: 15.5, volatility: 2, supply: 500, demandMultiplier: 0.9 },
                'UNI': { basePrice: 6.8, volatility: 0.8, supply: 800, demandMultiplier: 1.0 },
                'DOT': { basePrice: 7.2, volatility: 0.9, supply: 700, demandMultiplier: 1.0 },
                'ATOM': { basePrice: 10.3, volatility: 1.2, supply: 600, demandMultiplier: 0.95 },
                'AVAX': { basePrice: 35.4, volatility: 4, supply: 400, demandMultiplier: 1.1 },
                'MATIC': { basePrice: 0.88, volatility: 0.1, supply: 5000, demandMultiplier: 1.0 },
                'SOL': { basePrice: 105, volatility: 12, supply: 200, demandMultiplier: 1.2 },
                'BTC': { basePrice: 43500, volatility: 2000, supply: 5, demandMultiplier: 1.3 },
                'ETH': { basePrice: 2280, volatility: 150, supply: 30, demandMultiplier: 1.4 }
            };

            this.assets.forEach(asset => {
                const data = baseData[asset.symbol];
                const sellOrders = [];
                const buyOrders = [];

                const numSellers = Math.floor(Math.random() * 5) + 5;
                for (let i = 0; i < numSellers; i++) {
                    const price = data.basePrice + (Math.random() - 0.3) * data.volatility;
                    const units = (Math.random() * data.supply / numSellers) + (data.supply / numSellers * 0.5);
                    sellOrders.push({ price: Math.max(0.01, price), units });
                }

                const numBuyers = Math.floor(Math.random() * 8) + 10;
                for (let i = 0; i < numBuyers; i++) {
                    const price = data.basePrice + (Math.random() - 0.5) * data.volatility * 2;
                    const units = (Math.random() * data.supply * data.demandMultiplier / numBuyers) + (data.supply * 0.3 / numBuyers);
                    buyOrders.push({ price: Math.max(0.01, price), units });
                }

                this.marketData[asset.symbol] = {
                    sellOrders: sellOrders.sort((a, b) => a.price - b.price),
                    buyOrders: buyOrders.sort((a, b) => b.price - a.price)
                };
            });
        },

        get totalBids() {
            return Object.entries(this.bids).reduce((sum, [symbol, bid]) => {
                return sum + (bid.units * bid.price);
            }, 0);
        },

        get totalSells() {
            return Object.entries(this.sells).reduce((sum, [symbol, sell]) => {
                return sum + (sell.units > 0 ? 1 : 0);
            }, 0);
        },

        get smartBiddingFee() {
            if (this.totalBids <= this.userBalance) return 0;
            const shortfall = this.totalBids - this.userBalance;
            return shortfall * 0.05;
        },

        hasBid(symbol) {
            return this.bids[symbol].units > 0 && this.bids[symbol].price > 0;
        },

        hasSell(symbol) {
            return this.sells[symbol].units > 0;
        },

        updateBid() {
            this.bids[this.selectedBidAsset] = { ...this.currentBid };
        },

        updateSell() {
            this.sells[this.selectedSellAsset] = { ...this.currentSell };
        },

        clearBid(symbol) {
            this.bids[symbol] = { units: 0, price: 0 };
            if (this.selectedBidAsset === symbol) {
                this.currentBid = { units: 0, price: 0 };
            }
        },

        clearSell(symbol) {
            this.sells[symbol] = { units: 0, reservePrice: 0 };
            if (this.selectedSellAsset === symbol) {
                this.currentSell = { units: 0, reservePrice: 0 };
            }
        },

        formatCurrency(amount) {
            return new Intl.NumberFormat('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(amount);
        },

        updateCountdowns() {
            const now = new Date();

            // Get today's date in EST
            const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

            // Set deadlines for today in ET
            const assetDeadline = new Date(estNow);
            assetDeadline.setHours(11, 30, 0, 0);

            const bidDeadline = new Date(estNow);
            bidDeadline.setHours(12, 0, 0, 0);

            // If we've passed today's deadlines, show tomorrow's
            if (estNow > bidDeadline) {
                assetDeadline.setDate(assetDeadline.getDate() + 1);
                bidDeadline.setDate(bidDeadline.getDate() + 1);
            }

            // Calculate time differences in milliseconds
            const assetDiff = assetDeadline - estNow;
            const bidDiff = bidDeadline - estNow;

            // Convert to hours:mins:secs
            this.assetDeadlineCountdown = this.formatCountdown(assetDiff);
            this.bidDeadlineCountdown = this.formatCountdown(bidDiff);
        },

        formatCountdown(ms) {
            if (ms <= 0) return '00:00:00';

            const totalSeconds = Math.floor(ms / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;

            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        },

        getCountdownColor(type) {
            const countdown = type === 'asset' ? this.assetDeadlineCountdown : this.bidDeadlineCountdown;
            const [hours, minutes, seconds] = countdown.split(':').map(Number);
            const totalMinutes = hours * 60 + minutes;

            if (totalMinutes < 5) return 'text-red-600';
            if (totalMinutes < 30) return 'text-orange-600';
            return 'text-green-600';
        },

        addFunds() {
            if (this.fundAmount > 0) {
                this.userBalance += parseFloat(this.fundAmount);
            }
        },

        setFunds(amount) {
            this.userBalance = amount;
        },

        submitBids() {
            if (this.totalBids === 0) {
                alert('Please enter at least one bid.');
                return;
            }

            alert('Bids encrypted and submitted! Go to Results to run the simulation.');
            this.activeTab = 'results';
        },

        submitSells() {
            if (this.totalSells === 0) {
                alert('Please list at least one asset.');
                return;
            }

            alert('Assets locked for auction! Go to Results to run the simulation.');
            this.activeTab = 'results';
        },

        runSimulation() {
            this.simulationRun = true;
            this.assetsCleared = [];

            const fee = this.smartBiddingFee;
            let remainingBudget = this.userBalance - fee;

            const results = {
                assetsWon: 0,
                totalSpent: 0,
                remainingBalance: remainingBudget,
                feePaid: fee,
                buyerDetails: [],
                assetsSold: 0,
                totalRevenue: 0,
                reserveFeesPaid: 0,
                sellerDetails: []
            };

            for (const asset of this.assets) {
                const userBid = this.bids[asset.symbol];
                const userSell = this.sells[asset.symbol];

                let allBuyOrders = [...this.marketData[asset.symbol].buyOrders];
                let allSellOrders = [...this.marketData[asset.symbol].sellOrders];

                if (userBid.units > 0 && userBid.price > 0) {
                    allBuyOrders.push({ price: userBid.price, units: userBid.units, isUserBid: true });
                }

                if (userSell.units > 0) {
                    const sellPrice = userSell.reservePrice > 0 ? userSell.reservePrice : 0.01;
                    allSellOrders.push({ price: sellPrice, units: userSell.units, isUserSell: true, hasReserve: userSell.reservePrice > 0 });
                }

                allBuyOrders.sort((a, b) => b.price - a.price);
                allSellOrders.sort((a, b) => a.price - b.price);

                const clearingResult = this.calculateClearingPrice(allBuyOrders, allSellOrders);

                // Process buyer results
                if (userBid.units > 0 && userBid.price > 0) {
                    if (!clearingResult.clears) {
                        results.buyerDetails.push({
                            asset: asset.symbol,
                            bid: userBid.units * userBid.price,
                            won: false,
                            status: 'Market did not clear',
                            reason: 'No intersection between supply and demand'
                        });
                    } else if (userBid.price < clearingResult.price) {
                        results.buyerDetails.push({
                            asset: asset.symbol,
                            bid: userBid.units * userBid.price,
                            won: false,
                            status: 'Bid too low',
                            reason: `Your bid: ${this.formatCurrency(userBid.price)}, Clearing: ${this.formatCurrency(clearingResult.price)}`,
                            clearingPrice: clearingResult.price
                        });
                    } else {
                        const unitsWon = Math.min(userBid.units, clearingResult.unitsCleared);
                        const cost = unitsWon * clearingResult.price;

                        if (cost > remainingBudget) {
                            results.buyerDetails.push({
                                asset: asset.symbol,
                                bid: userBid.units * userBid.price,
                                won: false,
                                status: 'Insufficient funds',
                                reason: `Required: ${this.formatCurrency(cost)}, Available: ${this.formatCurrency(remainingBudget)}`,
                                clearingPrice: clearingResult.price
                            });
                        } else {
                            remainingBudget -= cost;
                            results.assetsWon++;
                            results.totalSpent += cost;
                            results.buyerDetails.push({
                                asset: asset.symbol,
                                bid: userBid.units * userBid.price,
                                won: true,
                                status: 'Won',
                                unitsWon,
                                clearingPrice: clearingResult.price,
                                amountPaid: cost
                            });
                        }
                    }
                }

                // Process seller results
                if (userSell.units > 0) {
                    if (!clearingResult.clears) {
                        let reserveFee = 0;
                        if (userSell.reservePrice > 0) {
                            reserveFee = userSell.reservePrice * userSell.units * 0.05;
                            results.reserveFeesPaid += reserveFee;
                        }

                        results.sellerDetails.push({
                            asset: asset.symbol,
                            listed: userSell.units,
                            sold: false,
                            status: 'Market did not clear',
                            reason: 'No buyers at your reserve price',
                            reserveFeePaid: reserveFee
                        });
                    } else if (userSell.reservePrice > 0 && clearingResult.price < userSell.reservePrice) {
                        const rmsDelta = Math.abs(clearingResult.price - userSell.reservePrice);
                        const reserveFee = rmsDelta * userSell.units * 0.05;
                        results.reserveFeesPaid += reserveFee;

                        results.sellerDetails.push({
                            asset: asset.symbol,
                            listed: userSell.units,
                            sold: false,
                            status: 'Reserve price not met',
                            reason: `Clearing: ${this.formatCurrency(clearingResult.price)}, Reserve: ${this.formatCurrency(userSell.reservePrice)}`,
                            clearingPrice: clearingResult.price,
                            reserveFeePaid: reserveFee
                        });
                    } else {
                        const unitsSold = Math.min(userSell.units, clearingResult.unitsCleared);
                        const revenue = unitsSold * clearingResult.price;

                        results.assetsSold++;
                        results.totalRevenue += revenue;
                        results.sellerDetails.push({
                            asset: asset.symbol,
                            listed: userSell.units,
                            sold: true,
                            status: 'Sold',
                            unitsSold,
                            clearingPrice: clearingResult.price,
                            revenue,
                            reserveFeePaid: 0
                        });
                    }
                }

                // Track all cleared assets for demand curves
                if (clearingResult.clears && !this.assetsCleared.includes(asset.symbol)) {
                    this.assetsCleared.push(asset.symbol);
                }

                if (clearingResult.clears) {
                    this.$nextTick(() => {
                        this.drawDemandCurve(asset.symbol, allBuyOrders, allSellOrders, clearingResult.price);
                    });
                }
            }

            results.remainingBalance = remainingBudget;
            this.results = results;
        },

        /**
         * Calculate clearing price for a uniform-price call auction (double auction)
         *
         * Algorithm based on auction theory:
         * 1. Sort buy orders descending (highest bid first)
         * 2. Sort sell orders ascending (lowest ask first)
         * 3. Match orders while bid >= ask, tracking cumulative quantities
         * 4. Clearing price = midpoint between lowest matched bid and highest matched ask
         *    Formula: k * lowestMatchedBid + (1-k) * highestMatchedAsk, where k = 0.5
         *
         * This ensures all matched buyers pay <= their bid and all matched sellers
         * receive >= their ask, with a uniform price for all participants.
         */
        calculateClearingPrice(buyOrders, sellOrders) {
            if (buyOrders.length === 0 || sellOrders.length === 0) {
                return { clears: false, price: null, unitsCleared: 0 };
            }

            // Sort buy orders descending by price (highest willingness to pay first)
            const sortedBuys = [...buyOrders].sort((a, b) => b.price - a.price);

            // Sort sell orders ascending by price (lowest ask first)
            const sortedSells = [...sellOrders].sort((a, b) => a.price - b.price);

            // Walk through both curves to find matches
            let buyIdx = 0;
            let sellIdx = 0;
            let cumulativeBuyQty = 0;
            let cumulativeSellQty = 0;

            let lowestMatchedBid = null;
            let highestMatchedAsk = null;
            let totalMatchedQty = 0;

            // Match orders greedily: pair highest bids with lowest asks
            while (buyIdx < sortedBuys.length && sellIdx < sortedSells.length) {
                const bid = sortedBuys[buyIdx];
                const ask = sortedSells[sellIdx];

                // Can this bid/ask pair trade?
                if (bid.price >= ask.price) {
                    // Yes! This is a valid match
                    lowestMatchedBid = bid.price;  // Track the marginal bid (last matched)
                    highestMatchedAsk = ask.price; // Track the marginal ask (last matched)

                    // Accumulate matched quantities from both sides
                    cumulativeBuyQty += bid.units;
                    cumulativeSellQty += ask.units;

                    // Total quantity that clears is limited by the smaller side
                    totalMatchedQty = Math.min(cumulativeBuyQty, cumulativeSellQty);

                    // Move to next orders
                    buyIdx++;
                    sellIdx++;
                } else {
                    // Bid < ask: no more matches possible
                    break;
                }
            }

            // Calculate uniform clearing price
            if (lowestMatchedBid !== null && highestMatchedAsk !== null) {
                // Use k-double auction formula with k=0.5 (midpoint)
                // This ensures fairness: price is between the marginal bid and ask
                const clearingPrice = 0.5 * lowestMatchedBid + 0.5 * highestMatchedAsk;

                return {
                    clears: true,
                    price: clearingPrice,
                    unitsCleared: totalMatchedQty
                };
            }

            // No matches found
            return { clears: false, price: null, unitsCleared: 0 };
        },

        drawDemandCurve(symbol, buyOrders, sellOrders, clearingPrice) {
            const canvas = document.getElementById('chart-' + symbol);
            if (!canvas) return;

            if (this.charts[symbol]) {
                this.charts[symbol].destroy();
            }

            const ctx = canvas.getContext('2d');

            const demandData = [];
            const supplyData = [];

            let cumUnits = 0;
            for (const order of buyOrders) {
                cumUnits += order.units;
                demandData.push({ x: cumUnits, y: order.price });
            }

            cumUnits = 0;
            for (const order of sellOrders) {
                cumUnits += order.units;
                supplyData.push({ x: cumUnits, y: order.price });
            }

            this.charts[symbol] = new Chart(ctx, {
                type: 'line',
                data: {
                    datasets: [
                        {
                            label: 'Demand',
                            data: demandData,
                            borderColor: 'rgb(16, 185, 129)',  // emerald-500
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            borderWidth: 2,
                            stepped: 'before',
                            fill: false
                        },
                        {
                            label: 'Supply',
                            data: supplyData,
                            borderColor: 'rgb(239, 68, 68)',  // red-500
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            borderWidth: 2,
                            stepped: 'after',
                            fill: false
                        },
                        {
                            label: 'Clearing Price',
                            data: [{ x: 0, y: clearingPrice }, { x: Math.max(...demandData.map(d => d.x)), y: clearingPrice }],
                            borderColor: 'rgb(59, 130, 246)',  // blue-500
                            borderDash: [5, 5],
                            borderWidth: 2,
                            pointRadius: 0,
                            fill: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    interaction: {
                        mode: 'nearest',
                        intersect: false
                    },
                    scales: {
                        x: {
                            type: 'linear',
                            title: {
                                display: true,
                                text: 'Cumulative Units',
                                color: '#cbd5e1'  // slate-300
                            },
                            ticks: {
                                color: '#94a3b8'  // slate-400
                            },
                            grid: {
                                color: 'rgba(71, 85, 105, 0.3)'  // slate-600 with opacity
                            }
                        },
                        y: {
                            type: 'linear',
                            title: {
                                display: true,
                                text: 'Price (USDC)',
                                color: '#cbd5e1'  // slate-300
                            },
                            ticks: {
                                color: '#94a3b8'  // slate-400
                            },
                            grid: {
                                color: 'rgba(71, 85, 105, 0.3)'  // slate-600 with opacity
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: true,
                            labels: {
                                color: '#f1f5f9'  // slate-100
                            }
                        },
                        tooltip: {
                            mode: 'nearest',
                            intersect: false,
                            backgroundColor: '#1e293b',  // slate-800
                            titleColor: '#f1f5f9',  // slate-100
                            bodyColor: '#cbd5e1',  // slate-300
                            borderColor: '#475569',  // slate-600
                            borderWidth: 1
                        }
                    }
                }
            });
        },

        resetSimulation() {
            this.simulationRun = false;
            this.assetsCleared = [];
            this.results = {
                assetsWon: 0,
                totalSpent: 0,
                remainingBalance: 0,
                feePaid: 0,
                buyerDetails: [],
                assetsSold: 0,
                totalRevenue: 0,
                reserveFeesPaid: 0,
                sellerDetails: []
            };

            Object.values(this.charts).forEach(chart => chart.destroy());
            this.charts = {};

            this.assets.forEach(asset => {
                this.bids[asset.symbol] = { units: 0, price: 0 };
                this.sells[asset.symbol] = { units: 0, reservePrice: 0 };
            });

            this.currentBid = { units: 0, price: 0 };
            this.currentSell = { units: 0, reservePrice: 0 };

            this.activeTab = 'bidder';
        }
    };
}
