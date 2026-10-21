import { createFileRoute } from "@tanstack/react-router";
import { Check, ShieldCheck, X } from "lucide-react";
import { PageHeader } from "@/components/app/kit";
import { ROLE_LABEL } from "@/lib/helena/registry";
import { useDB } from "@/lib/store";
import { pageHead } from "@/lib/head";
import type { Role } from "@/lib/types";

export const Route = createFileRoute("/_app/configuracoes/permissoes")({
  head: () => pageHead("Permissões & RBAC", "Matriz de permissões por perfil de usuário."),
  component: PermissionsPage,
});

const PERMISSION_GROUPS: {
  group: string;
  items: { key: string; label: string; desc: string }[];
}[] = [
  {
    group: "HELENA AI & Jarvis",
    items: [
      { key: "helena.use", label: "Interagir com Helena", desc: "Comandos por voz, chat e comando executivo" },
      { key: "approvals.decide", label: "Aprovar Operações de Risco", desc: "Aprovar ou negar planos e ações de risco alto" },
      { key: "agents.manage", label: "Gerenciar Agentes de IA", desc: "Criar, ativar, pausar e delegar tarefas para agentes" },
    ],
  },
  {
    group: "CRM Comercial",
    items: [
      { key: "crm.view", label: "Visualizar CRM", desc: "Acesso a leads, contatos, pipelines e empresas" },
      { key: "crm.edit", label: "Criar e Editar Oportunidades", desc: "Adicionar notas, mover etapas e criar contatos" },
      { key: "crm.delete", label: "Excluir Registros", desc: "Exclusão permanente de oportunidades e contatos" },
    ],
  },
  {
    group: "Atendimento & Mensagens",
    items: [
      { key: "messages.view", label: "Visualizar Conversas", desc: "Ler conversas da caixa de entrada omnichannel" },
      { key: "messages.send", label: "Enviar Mensagens", desc: "Responder contatos via WhatsApp e outros canais" },
      { key: "handoff.manage", label: "Handoff IA ↔ Humano", desc: "Assumir ou transferir conversas de agentes" },
    ],
  },
  {
    group: "Administração & Segurança",
    items: [
      { key: "org.manage", label: "Configurar Organização", desc: "Alterar dados da empresa, CNPJ e fuso horário" },
      { key: "users.manage", label: "Gerenciar Equipe", desc: "Convidar membros e alterar papéis de acesso" },
      { key: "analytics.view", label: "Acessar Métricas Executivas", desc: "Relatórios de vendas, custos de IA e conversão" },
    ],
  },
];

const ROLES: Role[] = ["owner", "admin", "manager", "agent", "viewer"];

function PermissionsPage() {
  const db = useDB();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Matriz de Permissões (RBAC)"
        description="Controle granular de acesso por perfil. Um usuário nunca pode pedir à Helena para executar o que ele próprio não tem permissão."
      />

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium min-w-[280px]">Módulo / Permissão</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-4 py-3 font-medium text-center">
                    {ROLE_LABEL[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {PERMISSION_GROUPS.map((grp) => (
                <tr key={grp.group} className="bg-transparent">
                  <td colSpan={ROLES.length + 1} className="p-0">
                    <div className="bg-muted/20 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-y">
                      {grp.group}
                    </div>
                    <table className="w-full">
                      <tbody className="divide-y">
                        {grp.items.map((item) => (
                          <tr key={item.key} className="hover:bg-muted/10 transition-colors">
                            <td className="px-5 py-3 min-w-[280px]">
                              <div className="font-medium text-foreground">{item.label}</div>
                              <div className="text-xs text-muted-foreground">{item.desc}</div>
                            </td>
                            {ROLES.map((role) => {
                              const allowed = db.rolePermissions[role]?.includes(item.key) ?? false;
                              return (
                                <td key={role} className="px-4 py-3 text-center">
                                  {allowed ? (
                                    <span className="inline-flex items-center justify-center size-6 rounded-full bg-success/15 text-success">
                                      <Check className="size-4" />
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center justify-center size-6 rounded-full bg-muted text-muted-foreground/40">
                                      <X className="size-3.5" />
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
