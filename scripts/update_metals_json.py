import json
import os
import sys
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

SOURCE_URL = os.getenv("METALS_SOURCE_URL", "").strip()
OUTPUT_FILE = "metals.json"


def fetch_json(url: str) -> dict:
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 GitHubAction metals.json updater"})
    with urlopen(req, timeout=30) as resp:
        data = resp.read().decode("utf-8")
        return json.loads(data)


def main():
    if not SOURCE_URL:
        print("ERROR: METALS_SOURCE_URL secret is not set.")
        sys.exit(1)

    try:
        data = fetch_json(SOURCE_URL)
    except HTTPError as e:
        print(f"ERROR: HTTP error while fetching source: {e}")
        sys.exit(1)
    except URLError as e:
        print(f"ERROR: URL error while fetching source: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: Unexpected fetch error: {e}")
        sys.exit(1)

    if "gold_usd_toz" not in data or "silver_usd_toz" not in data:
        print("ERROR: Source JSON must contain keys: gold_usd_toz and silver_usd_toz")
        print("Received:", data)
        sys.exit(1)

    cleaned = {
        "gold_usd_toz": float(data["gold_usd_toz"]),
        "silver_usd_toz": float(data["silver_usd_toz"]),
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, ensure_ascii=False, indent=2)
        f.write("
")

    print("metals.json updated successfully")
    print(json.dumps(cleaned, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
