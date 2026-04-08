
/*
	Run the action when we are sure the DOM has been loaded
	https://developer.mozilla.org/en-US/docs/Web/Events/DOMContentLoaded
	Example:
	whenDocumentLoaded(() => {
		console.log('loaded!');
		document.getElementById('some-element');
	});
*/
function whenDocumentLoaded(action) {
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", action);
	} else {
		// `DOMContentLoaded` already fired
		action();
	}
}



//mapping from type of powerplant to color:
function getColor(fuel) {
  switch (fuel) {
    case 'Coal': return 'black';
    case 'Gas': return 'orange';
    case 'Hydro': return 'blue';
    case 'Solar': return 'yellow';
    case 'Wind': return 'green';
    case 'Nuclear': return 'purple';
    default: return 'gray';
  }
}

//mapping from capacity to size:
function getRadius(capacity_mw) {
  if (!capacity_mw || capacity_mw <= 0) return 3;
  return Math.max(Math.log(capacity_mw + 1) * 1, 2);
}


//load map function
// JS replacement for loadMap
function loadMap() {
  // Initialize Leaflet map
  const map = L.map('map'	).setView([20, 0], 2); // lat, lon, zoom
	map.setMinZoom(2);
	map.setMaxZoom(18);
	map.invalidateSize();
  // Add tile layer (OpenStreetMap)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);



	const renderer = L.canvas({ padding: 0.5 });
	//import powerplant data and add markers:
	d3.csv('data/4-power-plants.csv', d => ({
	  name: d.name,
	  country: d.country_long,
	  fuel: d.primary_fuel,
	  capacity: +d.capacity_mw,
	  lat: +d.latitude,
	  lng: +d.longitude
	})).then(data => {

	  data.forEach(d => {
	    if (!isNaN(d.lat) && !isNaN(d.lng)) {
	      L.circleMarker([d.lat, d.lng], {
					renderer:renderer,
	        radius:getRadius(d.capacity),
	        fillColor: getColor(d.fuel),
	        color: 'red',
	        weight: 1,
	        fillOpacity: 0.7
	      })
	      .addTo(map)
	      .bindPopup(`
	        <b>${d.name}</b><br>
	        ${d.country}<br>
	        Fuel: ${d.fuel}<br>
	        Capacity: ${d.capacity} MW
	      `);

	    }
	  	});
		});



}

whenDocumentLoaded(() => {
	//do stuff
	loadMap();
});
