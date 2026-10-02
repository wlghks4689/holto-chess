// Blocking head script: platform and analytics are decided before the app starts.
window.porenaPlatform = new URLSearchParams(window.location.search).get("platform") === "crazygames" ? "crazygames" : "web";
if (window.porenaPlatform !== "crazygames") {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", "G-34CRPR69CF");
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=G-34CRPR69CF";
  document.head.appendChild(script);
}
