#include <iostream>
#include <random>
#include <vector>
#include <thread>
#include <chrono>
#include <iomanip>

// config
const double START_PRICE = 5000.0; 
const double VOLATILITY = 0.02;    // 2% standard deviation
const int TICK_SPEED_MS = 500; 

class MarketEngine {
private:
    double current_price;
    std::mt19937 gen; 
    std::normal_distribution<> d; 

public:
    MarketEngine(double start_price, double volatility) 
        : current_price(start_price), 
          gen(std::random_device{}()), 
          d(0.0, volatility) {}

    double tick() {
        // geometric brownian motion (simplified)
        // price(t) = price(t-1) * (1 + shock)
        double shock = d(gen); 
        current_price = current_price * (1.0 + shock);
        return current_price;
    }
};

int main() {
    MarketEngine potatoes(START_PRICE, VOLATILITY);

    std::cout << "--- cropex engine: commodity simulation ---\n";
    std::cout << "asset: irish potatoes (50kg)\n";
    std::cout << "tick_rate: " << TICK_SPEED_MS << "ms\n\n";

    while (true) {
        double price = potatoes.tick();
        
        // output format: [timestamp_placeholder] asset price
        std::cout << "[tick] " 
                  << std::fixed << std::setprecision(2) 
                  << price << " KES" << std::endl;

        std::this_thread::sleep_for(std::chrono::milliseconds(TICK_SPEED_MS));
    }

    return 0;
}