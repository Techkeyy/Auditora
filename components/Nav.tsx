"use client";

import Link from "next/link";

export default function Nav({ variant = "app" }: { variant?: "app" | "docs" }) {
  const scrollTo = (id: string) => () =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <nav className="nav">
      <div className="wrap nav-inner">
        <Link href="/" className="brand">
          <span className="brand-name">Argus</span>
        </Link>
        <div className="nav-links">
          {variant === "app" ? (
            <>
              <button className="navlink hide-sm" onClick={scrollTo("how")}>
                How it works
              </button>
              <button className="navlink hide-sm" onClick={scrollTo("registry")}>
                Registry
              </button>
              <button className="navlink hide-sm" onClick={scrollTo("console")}>
                Console
              </button>
              <Link className="navlink" href="/docs">
                Docs
              </Link>
            </>
          ) : (
            <Link className="navlink" href="/">
              ← Console
            </Link>
          )}
          <a
            className="pill-live"
            href="https://testnet.monadexplorer.com"
            target="_blank"
            rel="noreferrer"
          >
            <span className="dot" />
            <span>Live on Monad</span>
          </a>
        </div>
      </div>
    </nav>
  );
}
