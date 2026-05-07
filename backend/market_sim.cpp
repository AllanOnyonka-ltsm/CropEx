#define WIN32_LEAN_AND_MEAN
#include <iostream>
#include <string>
#include <vector>
#include <map>
#include <thread>
#include <chrono>
#include <mutex>
#include <iomanip>
#include <random>
#include <cmath>
#include "httplib.h"
#include "json.hpp"


using json = nlohmann::json;

void query_python_ai(const std::string& farmer_text) {
    json payload = {
        {"message", farmer_text},
        {"farmer_id", "12345"}
    };

    httplib::Client cli("localhost", 8000);

    auto res = cli.Post("/predict", payload.dump(), "application/json");

    if (res && res->status == 200) {
        auto ai_response = json::parse(res->body);
        std::cout << "[AI PARSED] Action: " << ai_response["action"] << std::endl;
        
        // Example: If AI says "BUY", trigger your Matching Engine here
        // if (ai_response["action"] == "BUY") {
        //     market[0]->place_order("BUY", ai_response["price"], ai_response["qty"]);
        // }
    } else {
        std::cerr << "[HTTP ERROR] Failed to connect to Python AI." << std::endl;
        if (res) std::cerr << "Status: " << res->status << std::endl;
    }
}

std::string extract_string(const std::string& json, const std::string& key) {
    std::string target = "\"" + key + "\":\"";
    size_t pos = json.find(target);
    if (pos == std::string::npos) return "";
    pos += target.length();
    size_t end = json.find("\"", pos);
    return json.substr(pos, end - pos);
}

double extract_number(const std::string& json, const std::string& key) {
    std::string target = "\"" + key + "\":";
    size_t pos = json.find(target);
    if (pos == std::string::npos) return 0.0;
    pos += target.length();
    size_t end = json.find_first_of(",}", pos);
    try { return std::stod(json.substr(pos, end - pos)); } catch (...) { return 0.0; }
}

struct OrderBook {
    std::string symbol;
    std::string name;
    std::string unit;
    double last_price;

    std::map<double, int, std::greater<double>> bids;
    // Asks = Sellers (Sorted lowest price first)
    std::map<double, int> asks; 
    
    std::mutex mtx; 

    OrderBook(std::string sym, std::string n, std::string u, double start_price) 
        : symbol(sym), name(n), unit(u), last_price(start_price) {}

    void place_order(std::string side, double price, int qty) {
        std::lock_guard<std::mutex> lock(mtx);
        
        if (side == "BUY") {
            while (qty > 0 && !asks.empty() && asks.begin()->first <= price) {
                auto best_ask = asks.begin();
                int trade_qty = std::min(qty, best_ask->second);
                
                qty -= trade_qty;
                best_ask->second -= trade_qty;
                last_price = best_ask->first;
                
                if (best_ask->second == 0) asks.erase(best_ask); 
            }
            if (qty > 0) bids[price] += qty;
        } 
        else if (side == "SELL") {
            while (qty > 0 && !bids.empty() && bids.begin()->first >= price) {
                auto best_bid = bids.begin();
                int trade_qty = std::min(qty, best_bid->second);
                
                qty -= trade_qty;
                best_bid->second -= trade_qty;
                last_price = best_bid->first; 
                
                if (best_bid->second == 0) bids.erase(best_bid);
            }
            if (qty > 0) asks[price] += qty;
        }
    }
};

// Global Market State
std::vector<OrderBook*> market;

void input_listener() {
    std::string line;
    while (std::getline(std::cin, line)) {
        std::string type = extract_string(line, "type");
        if (type == "NEW_ORDER") {
            std::string symbol = extract_string(line, "symbol");
            std::string side = extract_string(line, "side");
            double price = extract_number(line, "price");
            int qty = (int)extract_number(line, "qty");
            for (auto* book : market) {
                if (book->symbol == symbol) {
                    book->place_order(side, price, qty);
                    break;
                }
            }
        }
    }
}

void seed_market() {
    market.push_back(new OrderBook("PTO", "Potatoes", "90kg bag", 5000.0));
    market.push_back(new OrderBook("MAZ", "Maize", "90kg bag", 3200.0));
    market.push_back(new OrderBook("WHT", "Wheat", "90kg bag", 4100.0));
    market.push_back(new OrderBook("BNS", "Beans", "90kg bag", 8500.0));
    market.push_back(new OrderBook("ONN", "Onions", "90kg bag", 6000.0));
    market.push_back(new OrderBook("TMO", "Tomatoes", "90kg bag", 4500.0));
    market.push_back(new OrderBook("SGM", "Sorghum", "90kg bag", 2800.0));
    market.push_back(new OrderBook("CAS", "Cassava", "50kg bag", 1800.0));

    for (auto* book : market) {
        book->place_order("BUY", book->last_price - 10, 500);
        book->place_order("SELL", book->last_price + 10, 500);
    }
}

void market_maker_bot() {
    std::mt19937 gen(std::random_device{}());
    std::uniform_int_distribution<> action(0, 1); 
    std::uniform_int_distribution<> qty_gen(10, 50); 
    std::normal_distribution<> price_noise(0.0, 3.0);

    while (true) {
        for (auto* book : market) {
            double offset = price_noise(gen);
            double price = book->last_price + offset;
            
            price = std::round(price * 100.0) / 100.0; 
            
            int qty = qty_gen(gen);
            std::string side = action(gen) == 0 ? "BUY" : "SELL";

            book->place_order(side, price, qty);

            std::lock_guard<std::mutex> lock(book->mtx);
            if (book->bids.size() > 15) {
                auto it = book->bids.begin();
                std::advance(it, 15);
                book->bids.erase(it, book->bids.end());
            }
            if (book->asks.size() > 15) {
                auto it = book->asks.begin();
                std::advance(it, 15);
                book->asks.erase(it, book->asks.end());
            }
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(300));
    }
}

int main() {
    seed_market();
    std::thread listener(input_listener);
    listener.detach(); 

    std::thread bots(market_maker_bot);
    bots.detach();

    while (true) {
        auto now_c = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());

        for (auto* book : market) {
            std::lock_guard<std::mutex> lock(book->mtx);
            
            // Get best bid/ask
            double bid = book->bids.empty() ? book->last_price : book->bids.begin()->first;
            int bidVol = book->bids.empty() ? 0 : book->bids.begin()->second;
            
            double ask = book->asks.empty() ? book->last_price : book->asks.begin()->first;
            int askVol = book->asks.empty() ? 0 : book->asks.begin()->second;

            std::cout << "{"
                      << "\"symbol\":\"" << book->symbol << "\","
                      << "\"name\":\"" << book->name << "\","
                      << "\"unit\":\"" << book->unit << "\","
                      << "\"price\":" << std::fixed << std::setprecision(2) << book->last_price << ","
                      << "\"bid\":" << bid << ","
                      << "\"ask\":" << ask << ","
                      << "\"bidVol\":" << bidVol << ","
                      << "\"askVol\":" << askVol << ","
                      << "\"time\":" << now_c
                      << "}" << std::endl;
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }

    return 0;
}