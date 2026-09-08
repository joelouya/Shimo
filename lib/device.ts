/**
 * Which door a device opens.
 *
 * The visitor is already on one device: a phone opens the golfer, a laptop
 * opens the club. A coarse pointer or a narrow window reads as a phone.
 */
export function routeForDevice(): "/app" | "/admin" {
  if (typeof window === "undefined") return "/app";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const narrow = window.innerWidth < 1024;
  return coarse || narrow ? "/app" : "/admin";
}
