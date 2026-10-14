import "./env.js";
import { hashPassword } from "./auth.js";
import { pool } from "./database.js";

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
const companyName = process.env.BOOTSTRAP_COMPANY_NAME?.trim();

if (!email || !password || password.length < 12 || !name || !companyName) {
  throw new Error("Configure e-mail, senha de 12+ caracteres, nome do administrador e nome da empresa no ambiente.");
}

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("LOCK TABLE usuarios IN EXCLUSIVE MODE");
  const count = await client.query<{ total: string }>("SELECT count(*)::text AS total FROM usuarios");
  if (Number(count.rows[0]!.total) !== 0) throw new Error("Bootstrap recusado: já existe pelo menos um usuário.");

  const company = await client.query<{ id: string }>("INSERT INTO empresas(nome,padrao) VALUES($1,true) RETURNING id", [companyName]);
  const user = await client.query<{ id: string }>(
    `INSERT INTO usuarios(email,senha_hash,nome,perfil,status,empresa_padrao_id,email_verificado_em)
     VALUES($1,$2,$3,'super_administrador','ativo',$4,now()) RETURNING id`,
    [email, await hashPassword(password), name, company.rows[0]!.id],
  );
  await client.query("INSERT INTO usuario_empresas(usuario_id,empresa_id) VALUES($1,$2)", [user.rows[0]!.id, company.rows[0]!.id]);
  await client.query("COMMIT");
  process.stdout.write(`Superadministrador criado para ${email}. Remova as variáveis de bootstrap do ambiente.\n`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
