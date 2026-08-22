import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
USER_DATA = r"C:\Users\LEMYLOI\AppData\Local\hermes\cache\verify_lemyloi_dichvideo_headed"
PROJ = "verify-overlays-0004"

async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            USER_DATA, headless=False, executable_path=CHROME,
            args=["--disable-gpu", "--no-sandbox", "--window-size=1440,900"])
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        logs = []
        page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
        page.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))

        await page.goto(f"http://127.0.0.1:4000/en/editor/{PROJ}", wait_until="domcontentloaded", timeout=45000)

        try:
            await page.wait_for_function(
                "() => !document.body.innerText.includes('Loading project...')",
                timeout=60000)
            print("EDITOR_LOADED: True")
        except Exception:
            print("EDITOR_LOADED: False (still loading)")

        tabs = await page.eval_on_selector_all(
            "button[aria-label]",
            "els => els.map(e => e.getAttribute('aria-label'))")
        print("TAB_COUNT:", len(tabs))
        ov = [l for l in tabs if "Lớp phủ" in (l or "")]
        print("OVERLAY_TAB_FOUND:", len(ov) > 0)

        if ov:
            await page.click(f'button[aria-label="{ov[0]}"]')
            await page.wait_for_timeout(1500)
            body = await page.inner_text("body")
            for name in ["Pixelate", "Blur Strip", "Frosted Glass", "Remove Logo", "Remove Subtitle"]:
                print(f"PRESET_{name}:", name in body)

        await page.screenshot(path=str(Path(__file__).with_name("verify_overlays_final.png")))
        print("SCREENSHOT_SAVED")

        # print non-websocket errors
        real_errors = [l for l in logs if ("error" in l.lower() or "PAGEERROR" in l) and "WebSocket" not in l]
        print("--- REAL ERRORS ---")
        for l in real_errors[-20:]:
            print(l)
        await ctx.close()

asyncio.run(main())
