# Despliegues de Alux

El servicio arranca con `node dist/index.js`. El arranque no ejecuta migraciones,
reparaciones históricas, creación de usuarios predeterminados ni eliminación de
usuarios o roles. El programador habitual de cheques permanece activo.

Las modificaciones de esquema requieren un procedimiento separado:

1. Crear un respaldo de PostgreSQL y de `uploads`, y comprobar su restauración.
2. Revisar el SQL pendiente y probarlo sobre una copia aislada de la base.
3. Ejecutar `npm run db:migrate` únicamente cuando el cambio de esquema sea necesario.
4. Desplegar y verificar salud, acceso y conservación de los datos.

No usar `db:push`, `migrate reset`, semillas ni reparación automática de migraciones
para realizar un despliegue ordinario sobre producción. No eliminar los volúmenes.

El registro público está deshabilitado. La creación de usuarios se mantiene en
`POST /api/auth/users`, con autenticación y rol de administrador. El frontend
también bloquea `/api/auth/register` en Nginx.
