import { type ReactNode } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import MobileNav from "./MobileNav";

interface AppLayoutProps {
  title: string;
  children: ReactNode;
}

const defaultUser = { name: "\u0410\u043B\u0435\u043A\u0441\u0435\u0439 \u041A\u0440\u044B\u043B\u043E\u0432", role: "\u0421\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A" };

export default function AppLayout({ title, children }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar currentUser={defaultUser} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={title} />

        <main className="flex-1 overflow-y-auto p-[22px_26px] pb-20 md:pb-[22px] page-enter">
          {children}
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
