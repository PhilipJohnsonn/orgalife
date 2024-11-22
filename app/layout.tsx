import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AppSidebar } from './components/Sidebar'
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Life Organizer',
  description: 'Organize your life with ease',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SidebarProvider>
          <div className="flex h-screen">
            <AppSidebar />
            <SidebarInset className="flex-grow">
              {children}
            </SidebarInset>
          </div>
        </SidebarProvider>
      </body>
    </html>
  )
}

