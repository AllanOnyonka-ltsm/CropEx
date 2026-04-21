#include <iostream>
#include <random>
#include <vector>
#include <thread>
#include <chrono>
#include <iomanip>
#include <ctime>
#include <sstream>


const int TICK_SPEED_MS = 100; 

struct Commodity {
    std::string symbol;
    std::string name;
    double startPrice;
    double volatility;
    std::string unit; // "kg", "90kg bag", "tonne"
};

const std::vector<Commodity> COMMODITIES = {
    { "POTATO",  "Potatoes",      5000.0, 0.002, "90kg bag" },
    { "MAIZE",   "Maize",         3200.0, 0.0015,"90kg bag" },
    { "WHEAT",   "Wheat",         4100.0, 0.0018,"90kg bag" },
    { "BEANS",   "Beans",         8500.0, 0.003, "90kg bag" },
    { "ONION",   "Onions",        6000.0, 0.004, "90kg bag" },
    { "TOMATO",  "Tomatoes",      4500.0, 0.006, "90kg bag" },
    { "SORGHUM", "Sorghum",       2800.0, 0.002, "90kg bag" },
    { "CASSAVA", "Cassava",       1800.0, 0.0025,"50kg bag" },
};

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
    std::vector<MarketEngine> engines;
    for (const auto& c : COMMODITIES) {
        engines.emplace_back(c.startPrice, c.volatility);
    }

    while (true) {
        auto now = std::chrono::system_clock::now();
        auto now_c = std::chrono::system_clock::to_time_t(now);

        for (size_t i = 0; i < COMMODITIES.size(); i++) {
            double price = engines[i].tick();
            double spread = price * 0.001;

            std::cout << "{"
                      << "\"symbol\":\"" << COMMODITIES[i].symbol << "\","
                      << "\"name\":\"" << COMMODITIES[i].name << "\","
                      << "\"unit\":\"" << COMMODITIES[i].unit << "\","
                      << "\"price\":" << std::fixed << std::setprecision(2) << price << ","
                      << "\"bid\":"   << price - spread << ","
                      << "\"ask\":"   << price + spread << ","
                      << "\"bidVol\":" << (rand() % 500 + 100) << ","
                      << "\"askVol\":" << (rand() % 500 + 100) << ","
                      << "\"time\":"  << now_c
                      << "}" << std::endl;
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(TICK_SPEED_MS));
    }

    return 0;
}