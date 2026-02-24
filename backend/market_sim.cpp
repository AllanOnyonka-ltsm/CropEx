#include <iostream>
#include <random>
#include <vector>
#include <thread>
#include <chrono>
#include <iomanip>
#include <ctime>
#include <sstream>

// config
const double START_PRICE = 5000.0; 
const double VOLATILITY = 0.002;    // 2% standard deviation
const int TICK_SPEED_MS = 100; 

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

// helper to get current time as string
std::string get_iso_datetime() {
    auto now = std::chrono::system_clock::now();
    auto in_time_t = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << std::put_time(std::localtime(&in_time_t), "%Y-%m-%d %H:%M:%S");
    return ss.str();
}

int main() {
    MarketEngine potatoes(START_PRICE, VOLATILITY);

    while (true) {
        double price = potatoes.tick();
        auto now = std::chrono::system_clock::now();
        auto now_c = std::chrono::system_clock::to_time_t(now);
        
        std::cout << "{"
                  << "\"price\": " << std::fixed << std::setprecision(2) << price << ","
                  << "\"time\": " << now_c 
                  << "}" << std::endl; // endl flushes the stream

        std::this_thread::sleep_for(std::chrono::milliseconds(TICK_SPEED_MS));
    }

    return 0;
}