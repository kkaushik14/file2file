import hosting from '../hosting.json';

export function allowsOrigin(origin: string | null, requestOrigin: string) {
  return (
    origin === requestOrigin || origin === hosting.frontendOrigin || origin === hosting.pagesOrigin
  );
}
