
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

//histogram class form the bottom plots:
class EnergyHistogram {
	constructor(plot_id,data){
		this.data=data;
		this.svg = d3.select('#' + plot_id);
		//console.log(this.svg);
		const svg_viewbox = this.svg.node().viewBox.baseVal;

		// define margins
		const margin = { top: 10, right: 10, bottom: 20, left: 30 };
		const width  = svg_viewbox.width  - margin.left - margin.right;
		const height = svg_viewbox.height - margin.top  - margin.bottom;

		// move the plot_area inside the margins
		this.plot_area = this.svg.append('g')
		    .attr('transform', `translate(${margin.left},${margin.top})`);

		// scales now map to the **inner width/height**
		const x_scale = d3.scaleLinear()
		                  .domain([0,6])  // 7 fuel types
		                  .range([0, width]);

		const y_scale = d3.scaleLinear()
		                  .domain([0,1])  // normalized capacity
		                  .range([height, 0]);

		// X axis
		this.svg.append("text")
		    .attr("x", margin.left + width / 2)
		    .attr("y", margin.top + height + 15) // below plot
		    .attr("text-anchor", "middle")
		    .attr("dominant-baseline", "hanging")
		    .text("Fuel Type");

		// Y axis
		this.svg.append("text")
		    .attr("x", -(margin.top + height / 2))
		    .attr("y", 10) // a bit left of plot
		    .attr("transform", "rotate(-90)")
		    .attr("text-anchor", "middle")
		    .attr("dominant-baseline", "middle")
		    .text("Normalized Capacity");
		const fuels = ["Coal", "Gas", "Hydro", "Solar", "Wind", "Nuclear", "Other"];
		fuels.forEach((fuel, i) => {
			this.plot_area.selectAll("text.tick")
			  .data(fuels)
			  .enter()
			  .append("text")
			  .attr("x", (d,i) => x_scale(i))
			  .attr("y", height + 8)
			  .attr("text-anchor", "end")
			  .attr("transform", (d,i) => `rotate(-45, ${x_scale(i)}, ${height + 8})`)
			  .text(d => d)
			  .attr("class", "tick");
		});

		// Curve generator
		const lineGenerator = d3.line()
														.x(d => x_scale(d.x))
														.y(d => y_scale(d.y));


		this.plot_line = (histogram) => {
		  const data = histogram.map((currentValue, index) => ({
		    x: index,
		    y: currentValue
		  }));

		  const paths = this.plot_area.selectAll('path')
		    .data([data]);

		  // ENTER
		  paths.enter()
		    .append('path')
		    .merge(paths) // UPDATE
		    .attr("d", d => lineGenerator(d))
		    .attr("class", "curve");

		  // EXIT
		  paths.exit().remove();
		};

	}

	plot_histogram(min_lat, max_lat, min_lng, max_lng) {

	  const fuels = ["Coal", "Gas", "Hydro", "Solar", "Wind", "Nuclear", "Other"];

	  // Initialize accumulators
	  const sums = {};
	  const counts = {};

	  fuels.forEach(f => {
	    sums[f] = 0;
	    counts[f] = 0;
	  });

	  // 1. Filter + aggregate
	  this.data.forEach(d => {
	    const lat = +d.lat;
	    const lng = +d.lng;
	    if (lat >= min_lat && lat <= max_lat &&
	        lng >= min_lng && lng <= max_lng) {

	      let fuel = (d.fuel || "");
	      if (!fuels.includes(fuel)) fuel = "Other";

	      const capacity = +d.capacity || 0;

	      sums[fuel] += capacity;
	      counts[fuel] += 1;
	    }
	  });

	  // 2. Compute averages
	  let histogram = fuels.map(f => {
	    if (counts[f] === 0) return 0;
	    return sums[f] / counts[f];
	  });

	  // 3. Normalize (max = 1)
	  const maxVal = Math.max(...histogram, 0);

	  if (maxVal > 0) {
	    histogram = histogram.map(v => v / maxVal);
	  }

	  // 4. Plot
	  this.plot_line(histogram);
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

		const energy_hist= new EnergyHistogram("plot-1",data);
		//energy_hist.plot_histogram(0,20,0,20);
		map.on("moveend", () => {
		  const bounds = map.getBounds();

			  const min_lat = bounds.getSouth();
			  const max_lat = bounds.getNorth();
			  const min_lng = bounds.getWest();
			  const max_lng = bounds.getEast();

			  energy_hist.plot_histogram(min_lat, max_lat, min_lng, max_lng);
		});
		map.fire("moveend");


	  data.forEach(d => {
	    if (!isNaN(d.lat) && !isNaN(d.lng)) {
	      L.circleMarker([d.lat, d.lng], {
					renderer:renderer,
	        radius:getRadius(d.capacity),
	        fillColor: getColor(d.fuel),
	        color: 'black',
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
