import asyncio, json, sys
from playwright.async_api import async_playwright

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=CHROME,
            headless=True,
            args=["--no-sandbox"],
        )
        ctx = await browser.new_context(viewport={"width": 1600, "height": 1000})
        page = await ctx.new_page()

        # Collect console errors
        errors = []
        page.on("console", lambda m: errors.append(f"CONSOLE {m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))

        await page.goto("http://127.0.0.1:4000/", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(3000)

        title = await page.title()
        print("TITLE:", title)

        # Look for login or project list
        body_text = await page.inner_text("body")
        has_login = "log in" in body_text.lower() or "sign in" in body_text.lower()
        print("HAS_LOGIN:", has_login)
        print("BODY_SNIPPET:", body_text[:600].replace("\n", " | "))

        await browser.close()

asyncio.run(main())
