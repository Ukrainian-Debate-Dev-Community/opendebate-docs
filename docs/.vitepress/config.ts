import { defineConfig } from "vitepress";

export default defineConfig({
  title: "OpenDebate Docs",
  description: "Documentation for the OpenDebate platform",

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "API", link: "/api/getting-started" },
      { text: "Frontend", link: "/frontend/getting-started" },
    ],

    sidebar: {
      "/api/": [
        {
          text: "API",
          items: [
            { text: "Getting Started", link: "/api/getting-started" },
            { text: "Reference", link: "/api/reference" },
            { text: "Changelog", link: "/api/changelog" },
          ],
        },
      ],
      "/frontend/": [
        {
          text: "Frontend",
          items: [
            { text: "Getting Started", link: "/frontend/getting-started" },
            { text: "Reference", link: "/frontend/reference" },
            { text: "Changelog", link: "/frontend/changelog" },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/OpenDebateMap" },
    ],
  },
});
