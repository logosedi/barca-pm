"use client";

import {
  Bell,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Plug,
  Settings,
  SquareCheck,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { Avatar } from "./ui";

interface SidebarNavProps {
  user: { id: string; name: string; role: Role };
  projects: { key: string; name: string; color: string }[];
  unread: number;
  showIntegrations: boolean;
}

export function SidebarNav({ user, projects, unread, showIntegrations }: SidebarNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  function item(href: string, label: string, Icon: LucideIcon, badge?: number) {
    // "/projects" stays highlighted only on the list itself; a project page highlights its own entry.
    const active = href === "/projects" ? pathname === "/projects" : isActive(href);
    return (
      <Link
        href={href}
        onClick={close}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium",
          active ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        {badge ? (
          <span className="rounded-full bg-brand-700 px-1.5 text-[11px] leading-[18px] font-semibold text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <>
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5 md:hidden">
        <Logo className="text-slate-900" />
        <button
          type="button"
          className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
          {unread > 0 && !open ? <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand-600" /> : null}
        </button>
      </header>

      <nav
        aria-label="Principal"
        className={cn(
          "w-full shrink-0 flex-col border-r border-slate-200 bg-white md:flex md:h-full md:w-60",
          open ? "flex min-h-0 flex-1" : "hidden",
        )}
      >
        <div className="hidden px-4 pt-4 pb-3 md:block">
          <Logo className="text-slate-900" />
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-2.5 py-2">
          <div className="space-y-0.5">
            {item("/", "Painel", LayoutDashboard)}
            {item("/my-tasks", "Minhas tarefas", SquareCheck)}
            {item("/notifications", "Notificações", Bell, unread)}
          </div>

          <div>
            <div className="space-y-0.5">{item("/projects", "Projetos", FolderKanban)}</div>
            <ul className="mt-0.5 space-y-0.5">
              {projects.map((project) => {
                const href = `/projects/${project.key}`;
                const active = isActive(href);
                return (
                  <li key={project.key}>
                    <Link
                      href={href}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg py-1.5 pr-2.5 pl-3.5 text-sm",
                        active ? "bg-brand-50 font-medium text-brand-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                      )}
                    >
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                      <span className="truncate">{project.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="space-y-0.5">
            {item("/teams", "Times", Users)}
            {item("/members", "Pessoas", UserCog)}
            {showIntegrations ? item("/integrations", "Integrações", Plug) : null}
            {item("/settings", "Configurações", Settings)}
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-t border-slate-200 px-3 py-3">
          <Avatar id={user.id} name={user.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{user.name}</p>
            <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Sair" aria-label="Sair">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </nav>
    </>
  );
}
