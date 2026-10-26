// =====================================================================
// gestionar_usuarios_calbas_admin (v3) — altas y cambios de usuarios de
// Metrología. Solo administradores activos.
//
// La cuenta de Supabase Auth es COMPARTIDA con las demás apps de Pet's Table
// (Servicio Médico, Pruebas Industriales, …). Por eso «activo/inactivo» solo
// cambia perfiles_calbas.activo_calbas: el acceso a Metrología lo controlan
// el frontend y las políticas RLS (calbas_private.activo_calbas). La cuenta
// NUNCA se bloquea (ban) desde aquí.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const clean = (v: unknown) => String(v ?? "").trim();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || req.headers.get("apikey");
  if (!url || !serviceKey || !publicKey) {
    console.error("Falta la configuración del servidor para gestionar usuarios.");
    return json({ error: "La función de usuarios no está configurada correctamente en el servidor." }, 500);
  }

  const authorization = req.headers.get("Authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json({ error: "Sesión no válida. Inicia sesión nuevamente." }, 401);

  const callerClient = createClient(url, publicKey, {
    global: { headers: { Authorization: "Bearer " + bearer } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser(bearer);
  if (authError || !authData.user) {
    return json({ error: "Supabase no pudo validar tu sesión. Vuelve a iniciar sesión y repite la operación." }, 401);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const callerId = authData.user.id;
  const { data: caller, error: callerError } = await admin.from("perfiles_calbas")
    .select("rol_calbas,activo_calbas").eq("id_calbas", callerId).maybeSingle();
  if (callerError || !caller || caller.rol_calbas !== "admin" || caller.activo_calbas !== true) {
    return json({ error: "Solo los administradores activos pueden gestionar usuarios." }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }

  const action = clean(body.action);
  const email = clean(body.email).toLowerCase();
  const nombre = clean(body.nombre);
  const puesto = clean(body.puesto) || null;
  const rol = body.rol === "admin" ? "admin" : "usuario";
  const departamentoId = clean(body.departamento_id);
  const activo = body.activo !== false;
  const password = clean(body.password);
  const targetId = clean(body.user_id);
  const avatarBase64 = clean(body.avatar_base64);
  const avatarMime = clean(body.avatar_mime) || "image/jpeg";

  if (!["create", "update"].includes(action)) return json({ error: "Acción no reconocida." }, 400);
  if (!email || !nombre || !departamentoId) return json({ error: "Nombre, correo y departamento son obligatorios." }, 400);
  if (!/@petstable\.mx$/i.test(email)) return json({ error: "El correo debe ser @petstable.mx." }, 400);
  if (action === "create" && password.length < 8) return json({ error: "La contraseña inicial debe tener al menos 8 caracteres." }, 400);
  if (action === "update" && !targetId) return json({ error: "Falta el usuario que se va a actualizar." }, 400);
  if (action === "update" && targetId === callerId && (!activo || rol !== "admin")) {
    return json({ error: "No puedes desactivar ni quitarte el rol de administrador a ti mismo." }, 400);
  }

  const { data: dept, error: deptError } = await admin.from("departamentos_calbas")
    .select("id_calbas,nombre_calbas").eq("id_calbas", departamentoId).eq("activo_calbas", true).maybeSingle();
  if (deptError || !dept) return json({ error: "El departamento seleccionado no existe o está inactivo." }, 400);

  let uid = targetId;
  let created = false;
  if (action === "create") {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: nombre, nombre_completo_calbas: nombre }
    });
    if (error || !data.user) {
      const msg = error?.message || "No se pudo crear la cuenta.";
      if (/already|registered|exists/i.test(msg)) {
        return json({ error: "Ese correo ya tiene cuenta Pet's Table. Agrégalo desde «Buscar en cuentas existentes»." }, 409);
      }
      return json({ error: msg }, 400);
    }
    uid = data.user.id;
    created = true;
  } else {
    const { data: existing, error: existingError } = await admin.auth.admin.getUserById(uid);
    if (existingError || !existing?.user) return json({ error: "No se encontró la cuenta de autenticación del usuario." }, 404);
    // Solo se actualiza nombre/correo/contraseña; el estado de la cuenta compartida no se toca
    const authUpdates: Record<string, unknown> = {
      email, email_confirm: true,
      user_metadata: { ...(existing.user.user_metadata || {}), full_name: nombre, nombre_completo_calbas: nombre }
    };
    if (password) {
      if (password.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
      authUpdates.password = password;
    }
    const { error } = await admin.auth.admin.updateUserById(uid, authUpdates);
    if (error) return json({ error: error.message }, 400);
  }

  try {
    let avatarUrl: string | null = null;
    if (avatarBase64) {
      if (avatarBase64.length > 5_500_000) throw new Error("La fotografía es demasiado grande; elige una imagen más pequeña.");
      const raw = atob(avatarBase64.replace(/^data:[^,]+,/, ""));
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const ext = avatarMime.includes("png") ? "png" : avatarMime.includes("webp") ? "webp" : "jpg";
      const path = `${uid}.${ext}`;
      const { error: uploadError } = await admin.storage.from("avatares").upload(path, bytes, { contentType: avatarMime, upsert: true });
      if (uploadError) throw new Error("No se pudo guardar la fotografía en Storage/avatares: " + uploadError.message);
      avatarUrl = admin.storage.from("avatares").getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
    }

    // El acceso a Metrología se controla aquí (perfil activo/inactivo)
    const profilePatch: Record<string, unknown> = {
      id_calbas: uid, nombre_completo_calbas: nombre, correo_calbas: email,
      puesto_calbas: puesto, rol_calbas: rol, activo_calbas: activo
    };
    if (avatarUrl) profilePatch.avatar_url_calbas = avatarUrl;
    const { error: profileError } = await admin.from("perfiles_calbas").upsert(profilePatch, { onConflict: "id_calbas" });
    if (profileError) throw new Error("No se pudo guardar el perfil: " + profileError.message);

    const { error: clearError } = await admin.from("usuario_departamentos_calbas").delete().eq("usuario_id_calbas", uid);
    if (clearError) throw new Error("No se pudo actualizar el departamento: " + clearError.message);
    const { error: deptInsertError } = await admin.from("usuario_departamentos_calbas").insert({
      usuario_id_calbas: uid, departamento_id_calbas: departamentoId
    });
    if (deptInsertError) throw new Error("No se pudo asociar el departamento: " + deptInsertError.message);

    // Estados válidos de invitaciones_calbas: pendiente, enviado, aceptado, cancelado
    const { error: invitationError } = await admin.from("invitaciones_calbas").upsert({
      correo_calbas: email, nombre_completo_calbas: nombre, puesto_calbas: puesto,
      rol_calbas: rol, departamento_nombre_calbas: dept.nombre_calbas,
      usuario_id_calbas: uid, estado_calbas: activo ? "aceptado" : "cancelado",
      updated_at_calbas: new Date().toISOString()
    }, { onConflict: "correo_calbas" });
    if (invitationError) console.warn("No se pudo actualizar el registro de invitación:", invitationError.message);

    return json({ ok: true, user_id: uid, avatar_url: avatarUrl, departamento: dept.nombre_calbas });
  } catch (err) {
    if (created && uid) await admin.auth.admin.deleteUser(uid);
    return json({ error: err instanceof Error ? err.message : "Error al guardar el usuario." }, 500);
  }
});
