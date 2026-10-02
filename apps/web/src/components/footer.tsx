"use client";

import { Link } from "@/lib/navigation";
import Image from "next/image";
import { DEFAULT_LOGO_URL } from "@/constants/site-constants";

interface FooterLink {
	label: string;
	href: string;
}

const footerLinks: FooterLink[] = [];

export function Footer() {

	return (
		<footer className="border-t">
			<div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-6 py-8 sm:flex-row sm:justify-between">
				<div className="flex items-center gap-6">
					<Link href="/" className="flex items-center gap-2">
						<Image
							src={DEFAULT_LOGO_URL}
							alt="nuphuocthinh"
								width={28}
								height={28}
							className=""
						/>
						<span className="text-sm font-semibold">nuphuocthinh</span>
					</Link>
					<nav className="flex items-center gap-4">
						{footerLinks.map((link) => (
							<Link
								key={link.href}
								href={link.href}
								className="text-muted-foreground hover:text-foreground text-xs transition-colors"
							>
								{link.label}
							</Link>
						))}
					</nav>
				</div>

				<div className="flex items-center gap-4">
					<span className="text-muted-foreground ml-2 text-xs">
						© {new Date().getFullYear()} nuphuocthinh
					</span>
				</div>
			</div>
		</footer>
	);
}
