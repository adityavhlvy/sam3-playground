
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Link from "next/link";
import { BrainCircuit, SquareActivity, Database, LayoutDashboard, BarChart3 } from "lucide-react";
import SystemStatus from "@/components/SystemStatus";

export const metadata: Metadata = {
  title: "SAM3 Dashboard",
  description: "Interactive Dashboard for Segment Anything Model 3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark">
      <body className="antialiased min-h-screen bg-base-300 text-base-content font-sans">
        <div className="drawer lg:drawer-open">
          <input id="my-drawer-2" type="checkbox" className="drawer-toggle" />
          <div className="drawer-content flex flex-col">
            {/* Navbar for mobile */}
            <div className="w-full navbar bg-base-100 lg:hidden rounded-b-box shadow-sm mb-4">
              <div className="flex-none">
                <label htmlFor="my-drawer-2" className="btn btn-square btn-ghost">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-6 h-6 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                </label>
              </div>
              <div className="flex-1 px-2 mx-2 font-bold text-xl">SAM3 Dashboard</div>
            </div>

            {/* Main Content */}
            <main className="p-4 lg:p-8 w-full max-w-7xl mx-auto">
              {children}
            </main>
          </div>
          <div className="drawer-side z-20">
            <label htmlFor="my-drawer-2" aria-label="close sidebar" className="drawer-overlay"></label>
            <ul className="menu p-4 w-80 min-h-full bg-base-200 text-base-content gap-2 border-r border-base-content/10">
              {/* Sidebar content here */}
              <li className="mb-4">
                <div className="flex items-center gap-2 text-2xl font-bold px-0 hover:bg-transparent text-primary">
                  <BrainCircuit className="w-8 h-8" /> SAM3
                </div>
              </li>

              <li>
                <Link href="/" className="font-medium text-lg"><LayoutDashboard className="w-5 h-5" /> Dashboard</Link>
              </li>
              <li>
                <Link href="/train" className="font-medium text-lg"><SquareActivity className="w-5 h-5" /> Training</Link>
              </li>
              <li>
                <Link href="/inference" className="font-medium text-lg"><BrainCircuit className="w-5 h-5" /> Inference</Link>
              </li>
              <li>
                <Link href="/data-engine" className="font-medium text-lg"><Database className="w-5 h-5" /> Data Engine</Link>
              </li>
              <li>
                <Link href="/evaluate" className="font-medium text-lg"><BarChart3 className="w-5 h-5" /> Evaluation</Link>
              </li>
              <li>
                <Link href="/dataset" className="font-medium text-lg"><SquareActivity className="w-5 h-5" /> Datasets</Link>
              </li>

              <div className="divider"></div>

              <li className="mt-auto">
                <div className="bg-base-300 p-4 rounded-xl opacity-70 text-xs">
                  <SystemStatus />
                </div>
              </li>
            </ul>
          </div>
        </div>
      </body>
    </html>
  );
}

