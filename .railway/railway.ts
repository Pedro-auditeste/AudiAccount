// Serviço do ACCOUNT na Railway (workspace Governança). A Railway não lê este arquivo no deploy: as mudanças valem
// quando alguém roda `railway config apply` (precisa do pacote `railway`: npm install --no-save railway).
// O endereço audiaccount.up.railway.app é da própria Railway e fica fora daqui (`railway domain`).
import { defineRailway, github, project, service } from "railway/iac";

export default defineRailway(() => {
  const ACCOUNT = service("ACCOUNT", {
    source: github("Pedro-auditeste/AudiAccount", { checkSuites: false }), // cada push na main publica
    start: "node railway.js",
    // A Railway não tem região na América do Sul; a da Virgínia é a mais perto do AudiHoras e do Redis (São Paulo).
    replicas: { "us-east4-eqdc4a": 1 },
    networking: { privateNetworkEndpoint: "account" },
  });

  return project("ACCOUNT", {
    resources: [ACCOUNT],
  });
});
