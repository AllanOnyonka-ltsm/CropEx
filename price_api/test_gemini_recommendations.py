#!/usr/bin/env python3
"""
Test Gemini-powered recommendations endpoint.
Verifies that /recommendations uses LLM to generate farmer-friendly WhatsApp messages.
"""

import requests
import json

BASE_URL = "http://localhost:8000"

def test_gemini_recommendations():
    """Test that /recommendations returns LLM-generated farmer messages."""
    print("\n" + "="*70)
    print("Testing: Gemini-Powered Recommendations Endpoint")
    print("="*70)
    
    payload = {
        "commodity": "cabbage",
        "market": "Wakulima (Nairobi)",
        "admin1": "Nairobi",
        "pricetype": "retail",
        "predicted_price": 120.0,
        "previous_price": 100.0,
        "lower_bound": 105.0,
        "upper_bound": 135.0,
        "confidence_pct": 85.0,
        "unreasonable": False
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/recommendations",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=15
        )
        
        print(f"\nStatus Code: {response.status_code}")
        
        if response.status_code in [200, 201]:
            print("✅ SUCCESS\n")
            result = response.json()
            print(json.dumps(result, indent=2))
            
            # ─ Verify key fields ──────────────────────────────────────────
            print("\n" + "="*70)
            print("Verification Checklist")
            print("="*70)
            
            checks = [
                ("Has 'action' (sell/hold/monitor)", "action" in result),
                ("Has 'urgency' (immediate/soon/later/none)", "urgency" in result),
                ("Has 'price_trend' (rising/falling/stable)", "price_trend" in result),
                ("Has 'trend_pct' (numeric)", isinstance(result.get("trend_pct"), (int, float))),
                ("Has 'model_confidence' (high/medium/low)", "model_confidence" in result),
                ("Has 'reasons' (list)", isinstance(result.get("reasons"), list)),
                ("Has 'farmer_message' (LLM-generated)", "farmer_message" in result),
                ("farmer_message is non-empty", bool(result.get("farmer_message", "").strip())),
                ("Has 'rationale' (explanation)", "rationale" in result),
            ]
            
            all_passed = True
            for desc, passed in checks:
                status = "✅" if passed else "❌"
                print(f"{status} {desc}")
                if not passed:
                    all_passed = False
            
            if all_passed:
                print("\n✅ All checks passed! Gemini recommendations are working.")
            else:
                print("\n❌ Some checks failed. See above.")
            
            # ─ Show farmer message ────────────────────────────────────────
            print("\n" + "="*70)
            print("Farmer WhatsApp Message (from Gemini):")
            print("="*70)
            print(f"\n{result.get('farmer_message', 'N/A')}\n")
            
        else:
            print("❌ FAILED")
            print(f"Response: {response.text}")
            
    except requests.exceptions.Timeout:
        print("❌ ERROR: Request timed out (Gemini API may be slow or unavailable)")
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")

def test_webhook():
    """Test that /webhook returns structured intents."""
    print("\n" + "="*70)
    print("Testing: WhatsApp Intent Router Endpoint (/webhook)")
    print("="*70)
    
    test_cases = [
        ("Greeting", {"from_number": "+254...", "body": "jambo"}),
        ("Price Query (Swahili)", {"from_number": "+254...", "body": "bei ya mahindi"}),
        ("Sell Order", {"from_number": "+254...", "body": "sell 50 bags of maize"}),
        ("Unknown", {"from_number": "+254...", "body": "xyzabc random text"}),
    ]
    
    for name, payload in test_cases:
        print(f"\n─ {name}")
        try:
            response = requests.post(
                f"{BASE_URL}/webhook",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"  Intent: {result.get('intent')}")
                print(f"  Symbol: {result.get('symbol')}")
                if result.get('sms'):
                    print(f"  SMS: {result.get('sms')[:80]}...")
                print("  ✅")
            else:
                print(f"  ❌ Status {response.status_code}: {response.text[:100]}")
        except Exception as e:
            print(f"  ❌ Error: {str(e)}")

if __name__ == "__main__":
    print("\n" + "="*70)
    print("GEMINI & WEBHOOK TEST SUITE")
    print("="*70)
    print("\nMake sure the server is running: cd price_api && uvicorn app:app --reload")
    
    test_gemini_recommendations()
    test_webhook()
    
    print("\n" + "="*70)
    print("TEST SUITE COMPLETED")
    print("="*70 + "\n")
