# CropEx

CropEx is a high-frequency commodities trading platform designed for agricultural assets. It utilizes a C++ low-latency backend for order matching and market simulation, coupled with a React-based frontend for real-time visualization.

## Architecture

The system follows a decoupled Producer-Consumer architecture:

1.  **Market Engine (Backend)**
    *   **Language**: C++ (C++17 standard or higher).
    *   **Core Logic**: Implements a Geometric Brownian Motion (GBM) algorithm to simulate realistic market volatility and drift.
    *   **Performance**: Zero-garbage collection, optimized for sub-millisecond tick generation.
    *   **Transport**: Asynchronous WebSockets (simulating multicast feeds).

2.  **Dashboard (Frontend)**
    *   **Framework**: React (Vite).
    *   **Data Layer**: WebSocket observers for real-time DOM updates.
    *   **Visualization**: High-refresh-rate candlestick rendering.

## Directory Structure

*   `backend/` - C++ source code, headers, and build scripts for the simulation engine.
*   `frontend/` - React application, component library, and asset pipeline.
*   `docs/` - Architecture diagrams and API specifications.

## Prerequisites

*   **C++ Compiler**: GCC 9+, Clang 10+, or MSVC v142+ (C++17 support required).
*   **Node.js**: v18.x or higher.
*   **Package Manager**: npm or yarn.

## Local Development

### 1. Market Engine

The engine runs as a standalone process generating market data to standard output (stdout) or a specified WebSocket port.

```bash
cd backend
# Compile with optimization flags
g++ -O3 -std=c++17 market_sim.cpp -o cropex-engine

# Execute
./cropex-engine
* 2. Frontend Dashboard
* The dashboard connects to the engine stream.

* cd frontend
* npm install
* npm run dev
* Simulation Logic
* The market simulator currently utilizes a simplified stochastic process:
*   **P(t) = P(t-1) * (1 + N(0, σ))**
*   **P(t): Price at time t.**
*   **N(0, σ): Normal distribution with mean 0 and volatility σ.**
* Tick Rate: Configurable (Default: 500ms).

# Roadmap

*Implementation of Limit Order Book (LOB).

* WebSocket server integration (uWebSockets/Crow).

* Binary protocol serialization (Protobuf/Flatbuffers) for feed optimization.

* Docker containerization for deployment.

# License
* Private. All rights reserved.
