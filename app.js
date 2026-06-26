/**
 * Sénégal ExploMap - Application Logic
 * Interactive map, charts, filtering, search, export and geolocation.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Initialize Lucide Icons
  lucide.createIcons();

  // Application State
  const state = {
    allPoints: window.pointsOfInterest || [],
    filteredPoints: [],
    activeCategory: "all",
    searchQuery: "",
    theme: localStorage.getItem("theme") || "dark",
    map: null,
    markersGroup: null,
    userLocationMarker: null,
    charts: {
      category: null,
      city: null
    }
  };

  // Color mappings for map markers and charts (matching CSS variables)
  const colors = {
    culture: "#f59e0b",
    nature: "#10b981",
    plage: "#06b6d4",
    hotel_resto: "#f43f5e",
    accent: "#6366f1"
  };

  // Category labels for translations/display
  const categoryLabels = {
    culture: "Histoire & Culture",
    nature: "Nature & Parcs",
    plage: "Plages & Loisirs",
    hotel_resto: "Hôtels & Restos"
  };

  // SVG Icons for different categories
  const svgIcons = {
    culture: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22h18"></path><path d="M5 22V10a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12"></path><path d="m12 2-8 6h16L12 2Z"></path><path d="M9 22V12h6v10"></path></svg>`,
    nature: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19 7-7H5l7 7Z"></path><path d="m12 13 6-6H6l6 6Z"></path><path d="m12 7 5-5H7l5 5Z"></path><path d="M12 19v3"></path></svg>`,
    plage: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"></path><path d="m19 12-7-7-7 7b7.5 7.5 0 0 0 14 0Z"></path><path d="M12 9h.01"></path><path d="M19 12h-7"></path><path d="M5 12h7"></path></svg>`,
    hotel_resto: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"></path><path d="M2 8h18a2 2 0 0 1 2 2v10"></path><path d="M2 17h20"></path><path d="M6 8v9"></path></svg>`,
    default: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
  };

  // DOM Elements
  const themeToggleBtn = document.getElementById("theme-toggle");
  const searchInput = document.getElementById("search-input");
  const searchClearBtn = document.getElementById("search-clear-btn");
  const autocompleteList = document.getElementById("autocomplete-list");
  const filterPills = document.querySelectorAll(".filter-pill");
  const geoBtn = document.getElementById("geo-btn");
  const exportCsvBtn = document.getElementById("export-csv");
  const exportJsonBtn = document.getElementById("export-json");
  const mapStatusText = document.getElementById("map-status");

  // KPI DOM Elements
  const kpiTotal = document.getElementById("kpi-total");
  const kpiRating = document.getElementById("kpi-rating");
  const kpiCities = document.getElementById("kpi-cities");

  /* ==========================================================================
     Theme Configuration
     ========================================================================== */
  function initTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    updateThemeIcons();
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", state.theme);
    localStorage.setItem("theme", state.theme);
    updateThemeIcons();
    
    // Update map tile layer to match theme
    if (state.map) {
      state.map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
          state.map.removeLayer(layer);
        }
      });
      getTileLayer().addTo(state.map);
    }
    
    // Redraw charts with correct styling
    updateCharts();
  }

  function updateThemeIcons() {
    // Lucide icons are pre-rendered in HTML but handled by toggleTheme.
    // SVG icons are switched by CSS display, but theme attributes trigger changes.
  }

  function getTileLayer() {
    const isDark = state.theme === "dark";
    const url = isDark 
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
      
    return L.tileLayer(url, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20
    });
  }

  /* ==========================================================================
     Map Logic
     ========================================================================== */
  function initMap() {
    // Center map on Senegal (approx. geographical center coordinates)
    state.map = L.map("map", {
      center: [14.6, -16.3],
      zoom: 7.5,
      zoomControl: false // Custom placement later
    });

    // Add Zoom Control to the top-right
    L.control.zoom({ position: "topright" }).addTo(state.map);

    // Set initial tile layer
    getTileLayer().addTo(state.map);

    // Initialize Marker Cluster Group with customized styling
    state.markersGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 40,
      iconCreateFunction: (cluster) => {
        const childCount = cluster.getChildCount();
        const markers = cluster.getAllChildMarkers();
        
        // Find dominant category in this cluster to style it accordingly
        const categories = markers.map(m => m.options.category);
        const counts = {};
        let dominantCategory = "accent";
        let maxCount = 0;
        
        categories.forEach(cat => {
          counts[cat] = (counts[cat] || 0) + 1;
          if (counts[cat] > maxCount) {
            maxCount = counts[cat];
            dominantCategory = cat;
          }
        });

        return L.divIcon({
          html: `<div class="custom-cluster cluster-${dominantCategory}"><span>${childCount}</span></div>`,
          className: "custom-cluster-marker",
          iconSize: L.point(40, 40)
        });
      }
    });

    state.map.addLayer(state.markersGroup);
    mapStatusText.textContent = "Carte chargée";
  }

  // Create customized HTML Marker
  function createCustomMarker(point) {
    const color = colors[point.category] || colors.accent;
    const svgIcon = svgIcons[point.category] || svgIcons.default;
    
    const icon = L.divIcon({
      html: `
        <div class="custom-marker-pin" style="--marker-color: ${color}">
          ${svgIcon}
        </div>
      `,
      className: "custom-marker-div",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18]
    });

    const marker = L.marker([point.lat, point.lng], { 
      icon: icon,
      category: point.category,
      pointId: point.id 
    });

    // Generate Custom Popup HTML matching theme
    const popupContent = `
      <div class="popup-card">
        <img class="popup-img" src="${point.image}" alt="${point.name}" onerror="this.src='https://images.unsplash.com/photo-1598257006458-087169a1f08d?w=300'">
        <div class="popup-body">
          <span class="popup-category-badge ${point.category}">${categoryLabels[point.category] || point.category}</span>
          <h4 class="popup-title">${point.name}</h4>
          <div class="popup-city">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            ${point.city}
          </div>
          <div class="popup-rating">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            <span>${point.rating.toFixed(1)} / 5.0</span>
          </div>
          <p class="popup-desc">${point.description}</p>
          <div class="popup-actions">
            <a class="popup-btn popup-btn-primary" href="https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}" target="_blank">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg> Itinéraire
            </a>
            ${point.contact && point.contact !== "Mairie" ? `
              <a class="popup-btn popup-btn-secondary" href="tel:${point.contact.replace(/\s+/g, '')}">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg> Appeler
              </a>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    marker.bindPopup(popupContent, {
      maxWidth: 280,
      minWidth: 260
    });

    return marker;
  }

  // Update Markers displayed on the map based on active state filters
  function updateMapMarkers() {
    if (!state.map) return;
    
    // Clear existing markers
    state.markersGroup.clearLayers();

    // Recreate and add markers matching filters
    state.filteredPoints.forEach(point => {
      const marker = createCustomMarker(point);
      state.markersGroup.addLayer(marker);
    });

    // Dynamic zoom fit adjustment if points exist
    if (state.filteredPoints.length > 0 && state.activeCategory !== "all") {
      const bounds = L.latLngBounds(state.filteredPoints.map(p => [p.lat, p.lng]));
      state.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      mapStatusText.textContent = `${state.filteredPoints.length} sites affichés`;
    } else {
      mapStatusText.textContent = `${state.filteredPoints.length} sites au total`;
    }
  }

  /* ==========================================================================
     Filtering & Search Core Logic
     ========================================================================== */
  function filterData() {
    state.filteredPoints = state.allPoints.filter(point => {
      // 1. Filter by category
      const matchCategory = state.activeCategory === "all" || point.category === state.activeCategory;
      
      // 2. Filter by search query (checks name, description and city)
      const query = state.searchQuery.toLowerCase().trim();
      const matchSearch = !query || 
        point.name.toLowerCase().includes(query) || 
        point.city.toLowerCase().includes(query) ||
        point.description.toLowerCase().includes(query);

      return matchCategory && matchSearch;
    });

    // Update markers, badges, KPIs, and charts
    updateMapMarkers();
    updateBadges();
    updateKPIs();
    updateCharts();
  }

  // Setup count badges on Category Pills
  function updateBadges() {
    // Total count
    document.getElementById("badge-all").textContent = state.allPoints.length;
    
    // Category counts (taking search filter into account to display matches, or full count?)
    // Displaying search-matched counts is more advanced and responsive!
    const query = state.searchQuery.toLowerCase().trim();
    const matches = query ? state.allPoints.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.city.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query)
    ) : state.allPoints;

    const counts = { culture: 0, nature: 0, plage: 0, hotel_resto: 0 };
    matches.forEach(p => {
      if (counts[p.category] !== undefined) counts[p.category]++;
    });

    document.getElementById("badge-culture").textContent = counts.culture;
    document.getElementById("badge-nature").textContent = counts.nature;
    document.getElementById("badge-plage").textContent = counts.plage;
    document.getElementById("badge-hotel_resto").textContent = counts.hotel_resto;
  }

  /* ==========================================================================
     KPI calculations
     ========================================================================== */
  function updateKPIs() {
    kpiTotal.textContent = state.filteredPoints.length;
    
    if (state.filteredPoints.length > 0) {
      const sum = state.filteredPoints.reduce((acc, p) => acc + p.rating, 0);
      kpiRating.textContent = (sum / state.filteredPoints.length).toFixed(1);
    } else {
      kpiRating.textContent = "0.0";
    }

    const uniqueCities = new Set(state.filteredPoints.map(p => p.city));
    kpiCities.textContent = uniqueCities.size;
  }

  /* ==========================================================================
     Charts Dashboard logic (Chart.js)
     ========================================================================== */
  function initCharts() {
    const isDark = state.theme === "dark";
    const textThemeColor = isDark ? "#a1a1aa" : "#64748b";
    const gridThemeColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)";
    
    // 1. Category Doughnut Chart
    const ctxCat = document.getElementById("categoryChart").getContext("2d");
    state.charts.category = new Chart(ctxCat, {
      type: "doughnut",
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: [],
          borderWidth: isDark ? 2 : 1,
          borderColor: isDark ? "#18181b" : "#ffffff"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: {
              color: textThemeColor,
              font: { family: "Outfit", size: 11, weight: 500 }
            }
          }
        },
        cutout: "65%"
      }
    });

    // 2. City Bar Chart
    const ctxCity = document.getElementById("cityChart").getContext("2d");
    state.charts.city = new Chart(ctxCity, {
      type: "bar",
      data: {
        labels: [],
        datasets: [{
          label: "Sites",
          data: [],
          backgroundColor: colors.accent,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: textThemeColor,
              font: { family: "Outfit", size: 10 }
            }
          },
          y: {
            grid: { color: gridThemeColor },
            ticks: {
              precision: 0,
              color: textThemeColor,
              font: { family: "Outfit", size: 10 }
            }
          }
        }
      }
    });
  }

  function updateCharts() {
    if (!state.charts.category || !state.charts.city) return;

    const isDark = state.theme === "dark";
    const textThemeColor = isDark ? "#a1a1aa" : "#64748b";
    const gridThemeColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)";
    const chartBorderColor = isDark ? "#18181b" : "#ffffff";

    // --- Process Category Data ---
    const catData = { culture: 0, nature: 0, plage: 0, hotel_resto: 0 };
    state.filteredPoints.forEach(p => {
      if (catData[p.category] !== undefined) catData[p.category]++;
    });

    const categoriesUsed = Object.keys(catData).filter(cat => catData[cat] > 0);
    const categoryCounts = categoriesUsed.map(cat => catData[cat]);
    const categoryColors = categoriesUsed.map(cat => colors[cat]);
    const categoryNames = categoriesUsed.map(cat => categoryLabels[cat]);

    // Update Doughnut Chart
    state.charts.category.data.labels = categoryNames;
    state.charts.category.data.datasets[0].data = categoryCounts;
    state.charts.category.data.datasets[0].backgroundColor = categoryColors;
    state.charts.category.data.datasets[0].borderColor = chartBorderColor;
    state.charts.category.options.plugins.legend.labels.color = textThemeColor;
    state.charts.category.update();

    // --- Process City Data ---
    const cityData = {};
    state.filteredPoints.forEach(p => {
      cityData[p.city] = (cityData[p.city] || 0) + 1;
    });

    // Sort cities by site count desc
    const sortedCities = Object.keys(cityData).sort((a, b) => cityData[b] - cityData[a]);
    const cityCounts = sortedCities.map(city => cityData[city]);

    // Update Bar Chart
    state.charts.city.data.labels = sortedCities;
    state.charts.city.data.datasets[0].data = cityCounts;
    state.charts.city.data.datasets[0].backgroundColor = colors.accent;
    state.charts.city.options.scales.x.ticks.color = textThemeColor;
    state.charts.city.options.scales.y.ticks.color = textThemeColor;
    state.charts.city.options.scales.y.grid.color = gridThemeColor;
    state.charts.city.update();
  }

  /* ==========================================================================
     Autocomplete / Search Suggestion Functions
     ========================================================================== */
  function showAutocomplete(val) {
    autocompleteList.innerHTML = "";
    if (!val) {
      autocompleteList.classList.add("hidden");
      return;
    }

    const value = val.toLowerCase().trim();
    // Suggest both specific places matching or cities matching
    const matches = state.allPoints.filter(p => 
      p.name.toLowerCase().includes(value) || 
      p.city.toLowerCase().includes(value)
    ).slice(0, 5); // Limit suggestions to 5 items

    if (matches.length === 0) {
      autocompleteList.classList.add("hidden");
      return;
    }

    matches.forEach(item => {
      const div = document.createElement("div");
      div.className = "autocomplete-item";
      
      div.innerHTML = `
        <span class="autocomplete-title">${item.name}</span>
        <span class="autocomplete-subtitle">${item.city} • ${categoryLabels[item.category]}</span>
      `;

      div.addEventListener("click", () => {
        // Fill input
        searchInput.value = item.name;
        state.searchQuery = item.name;
        
        // Hide list
        autocompleteList.classList.add("hidden");
        
        // Execute general filter to isolate the item in stats/badges
        filterData();
        
        // Fly directly to point and open its popup
        if (state.map) {
          state.map.flyTo([item.lat, item.lng], 13);
          
          // Open popup by finding its marker inside Cluster Group
          state.markersGroup.eachLayer(layer => {
            if (layer.options.pointId === item.id) {
              setTimeout(() => {
                layer.openPopup();
              }, 400); // Wait for transition
            }
          });
        }
      });
      autocompleteList.appendChild(div);
    });

    autocompleteList.classList.remove("hidden");
  }

  // Close autocomplete on click outside
  document.addEventListener("click", (e) => {
    if (e.target !== searchInput && e.target !== autocompleteList) {
      autocompleteList.classList.add("hidden");
    }
  });

  /* ==========================================================================
     User Geolocation (GPS Navigation)
     ========================================================================== */
  function locateUser() {
    if (!navigator.geolocation) {
      alert("La géolocalisation n'est pas supportée par votre navigateur.");
      return;
    }

    const geoIcon = geoBtn.querySelector("i");
    geoIcon.setAttribute("data-lucide", "loader-2");
    geoIcon.classList.add("spin-animation"); // Let's ensure spin animates
    lucide.createIcons();
    mapStatusText.textContent = "Recherche GPS...";

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        // Reset button
        geoIcon.setAttribute("data-lucide", "locate");
        geoIcon.classList.remove("spin-animation");
        lucide.createIcons();
        mapStatusText.textContent = "Position localisée";

        // Remove previous location marker if exists
        if (state.userLocationMarker) {
          state.map.removeLayer(state.userLocationMarker);
        }

        // Add custom pulsing marker
        const myIcon = L.divIcon({
          className: "user-location-marker-container",
          html: '<div class="user-location-marker"></div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        state.userLocationMarker = L.marker([lat, lng], { icon: myIcon }).addTo(state.map);
        state.userLocationMarker.bindPopup("<b>Vous êtes ici !</b>").openPopup();

        // Focus map
        state.map.flyTo([lat, lng], 13);
      },
      (error) => {
        geoIcon.setAttribute("data-lucide", "locate");
        geoIcon.classList.remove("spin-animation");
        lucide.createIcons();
        mapStatusText.textContent = "Échec localisation";
        
        let msg = "Impossible d'accéder à votre position.";
        if (error.code === error.PERMISSION_DENIED) {
          msg = "Autorisation de géolocalisation refusée.";
        }
        alert(msg);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }

  /* ==========================================================================
     Data Export Logic (CSV & JSON)
     ========================================================================== */
  function exportCSV() {
    if (state.filteredPoints.length === 0) {
      alert("Aucune donnée à exporter.");
      return;
    }

    const headers = ["Nom", "Ville", "Categorie", "Description", "Latitude", "Longitude", "Note", "Contact"];
    const csvRows = [headers.join(",")];

    state.filteredPoints.forEach(p => {
      const row = [
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.city.replace(/"/g, '""')}"`,
        `"${p.category.replace(/"/g, '""')}"`,
        `"${p.description.replace(/"/g, '""')}"`,
        p.lat,
        p.lng,
        p.rating,
        `"${(p.contact || "").replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(","));
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `carto_export_senegal_${state.activeCategory}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function exportJSON() {
    if (state.filteredPoints.length === 0) {
      alert("Aucune donnée à exporter.");
      return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.filteredPoints, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `carto_export_senegal_${state.activeCategory}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /* ==========================================================================
     Event Bindings & Initialization Flow
     ========================================================================== */
  
  // Theme Toggler
  themeToggleBtn.addEventListener("click", toggleTheme);

  // Search Input Input Event
  searchInput.addEventListener("input", (e) => {
    const val = e.target.value;
    state.searchQuery = val;
    
    // Toggle Clear button visibility
    if (val) {
      searchClearBtn.classList.remove("hidden");
    } else {
      searchClearBtn.classList.add("hidden");
    }
    
    showAutocomplete(val);
    filterData();
  });

  // Search Clear button click
  searchClearBtn.addEventListener("click", () => {
    searchInput.value = "";
    state.searchQuery = "";
    searchClearBtn.classList.add("hidden");
    autocompleteList.classList.add("hidden");
    filterData();
  });

  // Category Pills filters
  filterPills.forEach(pill => {
    pill.addEventListener("click", () => {
      filterPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      
      state.activeCategory = pill.dataset.category;
      filterData();
    });
  });

  // GPS Locate
  geoBtn.addEventListener("click", locateUser);

  // Data Export Buttons
  exportCsvBtn.addEventListener("click", exportCSV);
  exportJsonBtn.addEventListener("click", exportJSON);

  // Initial Startup
  initTheme();
  initMap();
  initCharts();
  
  // Run initial calculations
  filterData();
});
