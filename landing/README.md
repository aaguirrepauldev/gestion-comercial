# Landing

Página de presentación de la app para publicitarla. Es un solo archivo estático (`index.html`), independiente del frontend y del backend: se puede abrir directo en el navegador o subir tal cual a Netlify, Vercel, GitHub Pages o cualquier hosting.

Antes de publicarla hay que completar los datos provisorios:

- Nombre de la marca ("Mostrador").
- Número de WhatsApp (`+54 9 11 0000-0000` y el enlace `wa.me/5491100000000`).
- Precio del plan Comercio ($30.000 por mes).

## Publicar en Netlify

`netlify.toml` en la raíz del repo ya le dice a Netlify que publique solo esta carpeta, sin compilar nada.

1. Entrá a [app.netlify.com](https://app.netlify.com) con tu cuenta de GitHub.
2. **Add new project → Import an existing project → GitHub** y elegí `gestion-comercial`.
3. Rama `main`. Los demás campos se completan solos con `netlify.toml`; tocá **Deploy**.
4. Queda en una dirección `*.netlify.app`. En **Project configuration → Change project name** podés cambiarle el nombre.

Cada cambio que entre a `main` se publica solo.
