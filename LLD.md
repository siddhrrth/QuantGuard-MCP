# Low-Level Design (LLD) — QuantGuard MCP

This Low-Level Design (LLD) document defines the architecture, components, data flow, API contracts, database schema, decision logic, and agent configurations for **QuantGuard MCP**, a microstructure-analytics and risk-aware execution platform built on the **NitroStack** framework.

---

## 1. System Architecture

The following diagram illustrates the flow from the client-facing UI (Trading Terminal/NitroStudio) down to the data providers and database storage:

```mermaid
graph TD
    subgraph Client Layer [Client Layer]
        Terminal["Trading Terminal (NitroStudio Dashboard)"]
        Widgets["6 Dashboard Panels (Vite / Next.js)"]
    end

    subgraph Interface Layer [MCP Interface]
        Client["MCP Client"]
        Server["QuantGuard MCP Server"]
    end

    subgraph Orchestration Layer [Orchestration Layer]
        MemoOrch["generate_trading_memo Orchestrator"]
        subgraph Agents [7 Specialized Agents]
            StratAgent["Strategy Agent"]
            RiskAgent["Risk Agent"]
            LiqAgent["Liquidity Agent"]
            ToxAgent["Toxicity Agent"]
            SpoofAgent["Spoofing Agent"]
            NewsAgent["News Agent"]
            VolAgent["Volatility Agent"]
        end
    end

    subgraph Service Layer [Service Layer]
        DbSvc["DbService"]
        ConfigSvc["ConfigService"]
        MarketSvc["MarketDataService"]
        BinanceWS["BinanceWSPlusDemoService"]
    end

    subgraph Data Sources [Data Layer]
        Yahoo["Yahoo Finance Provider (Free)"]
        BinanceFeed["Binance Live WebSocket Feed"]
        SQLite["SQLite Database (quantguard.db)"]
    end

    Terminal -->|Visualizes| Widgets
    Widgets -->|JSON-RPC calls| Client
    Client -->|MCP Protocol| Server
    Server -->|Registers Tools / Resources| MemoOrch

    MemoOrch -->|Invokes in Parallel| Agents
    Agents -->|Evaluates metrics| ServiceLayer

    MarketSvc -->|Injects Provider| Yahoo
    MarketSvc -->|Reads Live book| BinanceWS
    BinanceWS -->|Subscribes| BinanceFeed
    DbSvc -->|Executes Schema/SQL| SQLite
```

---

## 2. Module DI Components

Every module in the codebase is a NitroStack `@Module` using NestJS-style Dependency Injection. The DI hierarchy and dependencies are structured as follows:

```mermaid
graph TD
    AppModule["AppModule"]
    DbModule["DbModule"]
    ConfigModule["ConfigModule"]
    MarketModule["MarketModule"]
    OrderbookModule["OrderbookModule"]
    RiskModule["RiskModule"]
    NewsModule["NewsModule"]
    AgentsModule["AgentsModule"]
    StrategyModule["StrategyModule"]
    HealthModule["HealthModule"]

    AppModule -->|Imports| DbModule
    AppModule -->|Imports| ConfigModule
    AppModule -->|Imports| MarketModule
    AppModule -->|Imports| OrderbookModule
    AppModule -->|Imports| RiskModule
    AppModule -->|Imports| NewsModule
    AppModule -->|Imports| AgentsModule
    AppModule -->|Imports| StrategyModule
    AppModule -->|Imports| HealthModule

    DbService["DbService"]
    DbModule -->|Provides / Exports| DbService

    ConfigService["ConfigService"]
    ConfigModule -->|Provides / Exports| ConfigService

    YahooFinance["YahooFinanceProvider"]
    MarketSvc["MarketDataService"]
    MarketModule -->|Provides| YahooFinance
    MarketModule -->|Provides / Exports| MarketSvc
    MarketSvc -->|Depends On| YahooFinance
    MarketSvc -->|Depends On| ConfigService

    OrderbookSvc["OrderbookService"]
    OrderbookModule -->|Provides / Exports| OrderbookSvc
    OrderbookSvc -->|Depends On| DbService
    OrderbookSvc -->|Depends On| MarketSvc

    RiskSvc["RiskService"]
    RiskModule -->|Provides / Exports| RiskSvc
    RiskSvc -->|Depends On| DbService
    RiskSvc -->|Depends On| MarketSvc

    NewsSvc["NewsService"]
    NewsModule -->|Provides / Exports| NewsSvc
    NewsSvc -->|Depends On| DbService
    NewsSvc -->|Depends On| ConfigService

    OrchSvc["OrchestrationService"]
    AgentsModule -->|Provides / Exports| OrchSvc
    OrchSvc -->|Depends On| MarketSvc
    OrchSvc -->|Depends On| OrderbookSvc
    OrchSvc -->|Depends On| RiskSvc
    OrchSvc -->|Depends On| NewsSvc

    StrategySvc["StrategyService"]
    StrategyModule -->|Provides / Exports| StrategySvc
    StrategySvc -->|Depends On| DbService
    StrategySvc -->|Depends On| MarketSvc
```

---

## 3. Data Flow Scenario: "Is this market safe to trade?"

When a client queries the system's safety and execution strategy recommendations, the orchestrator coordinates metrics collection, parallel analytics, deterministic rules calculation, and agent explanations:

```mermaid
sequenceDiagram
    autonumber
    actor Terminal as Trading Dashboard
    participant Server as MCP Server / Orchestrator
    participant Res as Shared Resources (Market / Book)
    participant Tools as Analytics Tools (Toxicity, Spoofing, Risk)
    participant Strat as StrategyAgent / Rule Engine
    participant LLM as Claude (LLM)
    participant Db as SQLite Database

    Terminal->>Server: Call generate_trading_memo(ticker, account)
    
    Server->>Res: Fetch MarketResource & OrderBookResource
    Res-->>Server: Return Price, Spread, Depth, Imbalance
    
    Note over Server, Tools: Execute calculations in parallel
    par Toxicity Check
        Server->>Tools: analyze_order_flow_toxicity(ticker)
        Tools-->>Server: Return VPIN (e.g., 0.82)
    and Spoofing Detection
        Server->>Tools: detect_spoofing(ticker)
        Tools-->>Server: Return spoofingDetected (e.g., true)
    and Liquidity Analysis
        Server->>Tools: analyze_liquidity(ticker)
        Tools-->>Server: Return score (e.g., 28) & slippage
    and Risk Assessment
        Server->>Tools: analyze_risk(account)
        Tools-->>Server: Return exposure, VaR95, drawdown
    end
    
    Server->>Res: Fetch NewsResource (Headlines + Sentiment Score)
    Res-->>Server: Return sentiment score (e.g., -0.2) + articles
    
    Server->>Strat: Invoke StrategyAgent with all collected state
    Strat->>Tools: Run optimize_execution(rules-based decision engine)
    Note over Tools: Evaluates deterministic decision table
    Tools-->>Strat: Return recommendedStrategy (e.g., "WAIT"), ruleIds
    
    Strat->>LLM: Pass rule-based recommendation + metrics for plain-English explanation
    LLM-->>Strat: Return professional trader rationale text
    
    Strat-->>Server: Return Structured Memo
    Server->>Db: Persist signals & memo logs
    Server-->>Terminal: Return final structured JSON memo
    Note over Terminal: Recommendation Panel renders memo & triggers UI updates
```

---

## 4. Tool & Resource Contracts

### Shared Resources
Resources provide low-level data structures mapped to URI templates.

| Resource URI | Description | Input Schema | Output Schema |
|--------------|-------------|--------------|---------------|
| `market://{ticker}` | Real-time market metrics, spread, and candles. | `{ ticker: string }` | `MarketResourceSchema` |
| `orderbook://{ticker}` | Bid/ask levels, total depth, and order imbalance. | `{ ticker: string }` | `OrderBookResourceSchema` |
| `risk://{account}` | Portfolio exposure, VaR, Sharpe, and drawdown. | `{ account: string }` | `RiskResourceSchema` |
| `news://{ticker}` | Economic events, breaking news, and sentiment index. | `{ ticker: string }` | `NewsResourceSchema` |

### Core Analytics and Execution Tools
Tools perform actions and execute logic triggered by client requests or agent loops.

| Tool Name | Description | Input Schema (Zod) | Output Schema (Zod) |
|-----------|-------------|--------------------|---------------------|
| `scan_market` | Fetches base price, spread, volatility, and general health. | `ticker: string` | `price: number, spread: number, volatility: number, liquidityScore: number` |
| `analyze_order_flow_toxicity` | Computes VPIN (Volume-Synchronized Probability of Toxicity). | `ticker: string, buckets?: number` | `vpin: number, toxicityLevel: 'Low'\|'Medium'\|'High'` |
| `detect_spoofing` | Scans for large resting orders that appear and disappear. | `ticker: string, threshold?: number` | `spoofingDetected: boolean, signals: Array<{ price: number, side: string, size: number }>` |
| `analyze_liquidity` | Evaluates book depth and estimates slippage. | `ticker: string, orderSize: number` | `liquidityScore: number, estimatedSlippageBps: number` |
| `optimize_execution` | Deterministic decision table evaluator. **Rule-based only.** | `ticker: string, liquidityScore: number, toxicityScore: number, spoofingDetected: boolean, riskLevel: string` | `recommendedStrategy: 'WAIT'\|'TWAP'\|'VWAP'\|'ICEBERG'\|'MARKET', ruleDescription: string` |
| `analyze_risk` | Portfolio calculations: VaR95/99 and Expected Shortfall. | `account: string` | `var95: number, expectedShortfall: number, suggestedMaxPositionSize: number` |
| `backtest_strategy` | Simulates TWAP, VWAP, or Market orders on historical candles. | `ticker: string, strategy: 'TWAP'\|'VWAP'\|'MARKET', days?: number` | `sharpe: number, totalReturn: number, maxDrawdown: number, winRate: number` |
| `generate_trading_memo` | High-level orchestrator query summarizing market safety. | `ticker: string, account: string` | Full nested JSON schema containing ticker, timestamp, recommendations, confidence, and reasoning. |

---

## 5. Database Schema (ERD)

The SQLite database (`quantguard.db`) schema and relations:

```mermaid
erDiagram
    orders {
        TEXT id PK
        TEXT symbol
        TEXT side
        REAL quantity
        REAL price
        TEXT status
        DATETIME created_at
        DATETIME updated_at
    }
    trades {
        TEXT id PK
        TEXT order_id FK
        TEXT symbol
        REAL quantity
        REAL price
        DATETIME executed_at
    }
    orderbook_snapshots {
        TEXT id PK
        TEXT symbol
        TEXT bids
        TEXT asks
        DATETIME timestamp
    }
    risk {
        TEXT id PK
        TEXT symbol
        REAL var_95
        REAL cvar_95
        REAL sharpe_ratio
        REAL max_drawdown
        DATETIME calculated_at
    }
    signals {
        TEXT id PK
        TEXT symbol
        TEXT signal_type
        REAL confidence
        DATETIME generated_at
    }
    strategies {
        TEXT id PK
        TEXT name
        TEXT description
        TEXT status
        TEXT parameters
        DATETIME created_at
        DATETIME updated_at
    }
    news {
        TEXT id PK
        TEXT title
        TEXT content
        TEXT source
        TEXT url
        DATETIME published_at
        DATETIME fetched_at
        REAL sentiment
    }
    logs {
        TEXT id PK
        TEXT level
        TEXT message
        TEXT context
        DATETIME created_at
    }

    orders ||--o{ trades : "executes into"
    orders ||--|| strategies : "governed by"
```

---

## 6. Decision Logic Table for `optimize_execution`

The execution logic is entirely rule-based and auditable. The LLM **never** overrides these decisions:

| Condition # | Spoofing | Toxicity (VPIN) | Liquidity Score | Portfolio VaR Risk | Recommended Strategy | Rationale & Code Trigger |
|-------------|----------|-----------------|-----------------|--------------------|----------------------|--------------------------|
| 1 | **TRUE** | Any | Any | Any | **WAIT** | Spoofing detected in the order book. High price manipulation risk. |
| 2 | Any | **> 0.70 (High)**| Any | Any | **WAIT** | Order flow toxicity is extremely high (VPIN > 0.70). High risk of adverse selection. |
| 3 | FALSE | <= 0.70 | **< 30 (Low)** | Any | **TWAP** | Market is highly illiquid. Use Time-Weighted Average Price to split size. |
| 4 | FALSE | <= 0.70 | >= 30 | **High (> Limit)** | **ICEBERG** | Account exposure/VaR exceeds limits. Use Iceberg order to hide block size. |
| 5 | FALSE | **0.40 - 0.70** | >= 30 | Safe | **VWAP** | Moderate toxicity detected. Participate along volume profile to avoid impact. |
| 6 | FALSE | < 0.40 | **>= 70 (High)**| Safe | **MARKET** | Liquid and safe conditions. Immediate execution via Market Order. |
| 7 | Default | Default | Default | Default | **TWAP** | Default fallback for stable execution. |

---

## 7. Dashboard Wireframe Flow

The layout contains 6 primary widgets configured inside NitroStudio. The live demo prioritizes the **Recommendation Panel** as the landing view.

```mermaid
graph TD
    subgraph Dashboard UI Layout [Dashboard UI Layout]
        Widget1["1. Market Overview<br/>(scan_market Tool)"]
        Widget2["2. Order Book Heatmap<br/>(orderbook://{ticker} Resource)"]
        Widget3["3. Order Flow / VPIN<br/>(analyze_order_flow_toxicity Tool)"]
        Widget4["4. Spoofing Panel<br/>(detect_spoofing Tool)"]
        Widget5["5. Risk Panel<br/>(risk://{account} Resource)"]
        Widget6["6. Recommendation Panel<br/>(generate_trading_memo Tool)"]
    end

    DataService["BinanceWSPlusDemoService (Data Producer)"]
    DataService -->|Feeds real-time updates| Widget1
    DataService -->|Feeds bids/asks| Widget2
    DataService -->|Feeds trade prints| Widget3
    DataService -->|Feeds cancel events| Widget4
    
    Widget6 -->|Triggers orchestrator| Widget1 & Widget2 & Widget3 & Widget4 & Widget5
    Note over Widget6: Live Demo lands here. Auto-updates when synthetic spoof is injected.
```

---

## 8. Agent Prompt Templates

Each of the 7 agents is declared using NitroStack `@Prompt` decorators. These are their exact template definitions:

### 1. LiquidityAgent Prompt
```
You are the Liquidity Agent for QuantGuard.
Your task is to analyze order book depth, bid-ask spreads, and order sizes.
Analyze the following parameters:
- Bid-Ask Spread: {spread} bps
- Total Depth (Bids): {bidDepth} units
- Total Depth (Asks): {askDepth} units
- Imbalance Score: {orderImbalance} (-1 to 1)

Provide a detailed summary of depth and market thickness in quantitative terminology. Detail slippage risks for a standardized order of {orderSize} units.
```

### 2. ToxicityAgent Prompt
```
You are the Toxicity Agent for QuantGuard.
Your task is to evaluate adverse selection risk using the VPIN metric (Volume-Synchronized Probability of Toxicity).
Analyze the following parameters:
- VPIN Score: {vpin} (range 0 to 1)
- Toxicity Level: {toxicityLevel}

Explain whether informed traders are dominating order flow. Provide clear warnings if high toxicity will result in immediate adverse execution. Use terminology like "informed flow", "uninformed flow", and "adverse selection".
```

### 3. SpoofingAgent Prompt
```
You are the Spoofing Agent for QuantGuard.
Your task is to detect manipulative order book activity such as phantom buy/sell walls.
Analyze the following parameters:
- Spoofing Detected: {spoofingDetected}
- Recent Cancel Events: {cancelEvents}

Detail if there is a pattern of large orders appearing and disappearing rapidly within tight price windows. Highlight if these cancellations are correlated with price movements in the opposite direction.
```

### 4. VolatilityAgent Prompt
```
You are the Volatility Agent for QuantGuard.
Your task is to analyze price variance, range, and volatility spikes.
Analyze the following parameters:
- Realized Volatility: {realizedVolatility}
- High-Low Candle Range: {hlRange}
- Volatility Level: {volatilityLevel}

Explain if volatility is expanding or contracting, and how it impacts bid-ask spreads.
```

### 5. RiskAgent Prompt
```
You are the Risk Agent for QuantGuard.
Your task is to evaluate portfolio exposure, drawdown safety limits, and Value-at-Risk.
Analyze the following parameters:
- Account: {account}
- Current Exposure: {currentExposure}
- VaR (95%): {var95}
- CVaR (95% Expected Shortfall): {expectedShortfall}
- Max Drawdown: {maxDrawdown}
- Leverage: {leverage}

Advise on the safety of initiating new positions. Recommend maximum size based on current portfolio VaR limits.
```

### 6. NewsAgent Prompt
```
You are the News Agent for QuantGuard.
Your task is to assess macroeconomic event risk and headline sentiment.
Analyze the following parameters:
- News Sentiment Score: {sentimentScore} (-1 to 1)
- Breaking Headlines: {headlines}
- Upcoming Calendar Events: {calendar}

Explain how macro news or calendar events may impact market microstructure stability in the next 1-4 hours.
```

### 7. StrategyAgent Prompt
```
You are the Lead Strategy Agent for QuantGuard.
You compile the final Market Safety Memo.

You will receive the following parameters:
- Ticker: {ticker}
- Deterministic Strategy Decision: {recommendedStrategy} (This was calculated using our auditable rule-engine and CANNOT be changed!)
- Rule Rationale: {ruleDescription}
- VPIN Analysis: {toxicityExplanation}
- Spoofing Analysis: {spoofingExplanation}
- Liquidity Analysis: {liquidityExplanation}
- Volatility Analysis: {volatilityExplanation}
- Portfolio Risk Analysis: {riskExplanation}
- News Sentiment Analysis: {newsExplanation}

Draft an institutional-grade Executive Trading Memo. Your memo must be written in professional trading-desk jargon (e.g., "adverse selection", "order book depletion", "skewness", "illiquidity penalty").
Structure your memo exactly as follows:
1. Executive Recommendation (WAIT / TWAP / VWAP / ICEBERG / MARKET) in bold.
2. Confidence Score (0-100%).
3. Microstructure Assessment (Liquidity, Toxicity, Spoofing, Volatility).
4. Portfolio Constraints & Exposure Risk.
5. Execution Strategy Rationale (explaining why the chosen strategy is optimal given the conditions).

Keep the summary clear, professional, and free of vague stock-tipping predictions. Focus strictly on market microstructure and execution safety.
```
