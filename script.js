mapboxgl.accessToken = 'pk.eyJ1IjoicGxndWVkZXMiLCJhIjoiZEg0TXRZOCJ9.J1TTOXpWW3ERgXWcG2uTdQ';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v11',
    center: [-34.8781405, -8.0641775],
    zoom: 15
});

const colors = {
    'coliving': '#e41a1c',
    'flat': '#377eb8',
    'his': '#4daf4a',
    'hotel': '#c42f44'
    'hostel': '#984ea3',
    'ocupação': '#ff7f00',
    'pousada': '#ffff33',
    'res-misto': '#a65628',
    'res-multifamiliar': '#f781bf',
    
};

const dataUrl = `https://sheets.googleapis.com/v4/spreadsheets/1pNHyLO6PCJKm9arr_unwoYufGhpuWyKC80uKoJPsv0E/values/Lista?key=AIzaSyBnzMrMQvlRhamu5wkKjweI2Iq1oIJZCog`;

async function loadGoogleSheetsData(url) {
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (!data.values) {
            console.error('Nenhum dado encontrado na resposta da API.');
            return [];
        }
        const rows = data.values;
        const headers = rows[0];
        return rows.slice(1).map(row => {
            let obj = {};
            row.forEach((value, index) => {
                obj[headers[index]] = value;
            });
            return obj;
        });
    } catch (error) {
        console.error('Erro ao carregar dados do Google Sheets:', error);
        return [];
    }
}

function convertCoordinates(coord) {
    return parseFloat(coord.replace(',', '.'));
}

function createGeoJSON(data) {
    return {
        type: 'FeatureCollection',
        features: data.map(point => {
            const lng = convertCoordinates(point.longitude);
            const lat = convertCoordinates(point.latitude);
            if (isNaN(lng) || isNaN(lat)) {
                console.warn(`Coordenadas inválidas para o ponto: ${JSON.stringify(point)}`);
                return null;
            }
            const tipo = point.TIPO ? point.TIPO.toLowerCase().replace(/\s+/g, '-').replace('.', '') : 'outro';
            const color = colors[tipo] || colors['outro'];
            return {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [lng, lat]
                },
                properties: {
                    name: point.NOME,
                    bairro: point.BAIRRO,
                    endereco: point.ENDEREÇO,
                    tipo: point.TIPO,
                    unidades: point.UNIDADES,
                    unidadeTipo: point['Unidade-tipo'],
                    populacao: point.POPULAÇÃO,
                    areaConstruida: point['ÁREA CONSTRUÍDA'],
                    investimento: point.INVESTIMENTO,
                    aluguelM2: point['ALUGUEL R$/m²'],
                    situacao: point.SITUAÇÃO,
                    inicio: point.INÍCIO,
                    entrega: point.ENTREGA,
                    color: color,
                    longitude: point.longitude,
                    latitude: point.latitude
                }
            };
        }).filter(feature => feature !== null)
    };
}

function addMarkers(geojson) {
    map.addSource('markers', {
        type: 'geojson',
        data: geojson
    });

    map.addLayer({
        id: 'markers',
        type: 'circle',
        source: 'markers',
        paint: {
            'circle-radius': 8,
            'circle-color': ['get', 'color'],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2
        }
    });

    map.on('click', 'markers', async (e) => {
        const coordinates = e.features[0].geometry.coordinates.slice();
        const properties = e.features[0].properties;
        const popupContent = await createPopupContent(properties);

        new mapboxgl.Popup()
            .setLngLat(coordinates)
            .setHTML(popupContent)
            .addTo(map);
    });

    map.on('mouseenter', 'markers', () => {
        map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'markers', () => {
        map.getCanvas().style.cursor = '';
    });
}

async function createPopupContent(properties) {
    const streetViewUrl = getStreetViewImage(properties.latitude, properties.longitude);

    return `
        <div class="popup-content">
            <h3>${properties.name}</h3>
            <p><strong>Bairro:</strong> ${properties.bairro}</p>
            <p><strong>Endereço:</strong> ${properties.endereco}</p>
            <p><strong>Tipo:</strong> ${properties.tipo}</p>
            <p><strong>Unidades:</strong> ${properties.unidades}</p>
            <p><strong>Unidade-tipo:</strong> ${properties.unidadeTipo}</p>
            <p><strong>POPULAÇÃO:</strong> ${properties.populacao}</p>
            <p><strong>ÁREA CONSTRUÍDA:</strong> ${properties.areaConstruida}</p>
            <p><strong>INVESTIMENTO:</strong> ${properties.investimento}</p>
            <p><strong>R$/m² da obra:</strong> ${properties.aluguelM2}</p>
            <p><strong>ALUGUEL R$/m²:</strong> ${properties.aluguelM2}</p>
            <p><strong>Situação:</strong> ${properties.situacao}</p>
            <p><strong>Início:</strong> ${properties.inicio}</p>
            <p><strong>Entrega:</strong> ${properties.entrega}</p>
            <img src="${streetViewUrl}" alt="Google Street View Image" />
        </div>
    `;
}

function getStreetViewImage(lat, lng) {
    const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=200x200&location=${lat},${lng}&fov=120&source=outdoor&pitch=10&key=AIzaSyDHtM7TQFC5tvvPTOLUrjesABt_G2pJ75k`;
    return streetViewUrl;
}

function filterMarkers(data, typeFilter, bairroFilter, statusFilter) {
    let filteredData = data.filter(point => {
        const typeMatch = typeFilter === 'all' || point.TIPO.toLowerCase().replace(/\s+/g, '-').replace('.', '') === typeFilter;
        const bairroMatch = bairroFilter === 'all' || point.BAIRRO.toLowerCase() === bairroFilter.toLowerCase();
        const statusMatch = statusFilter === 'all' || (point.SITUAÇÃO && point.SITUAÇÃO.toLowerCase() === statusFilter.toLowerCase());
        return typeMatch && bairroMatch && statusMatch;
    });

    const geojson = createGeoJSON(filteredData);

    if (map.getSource('markers')) {
        map.getSource('markers').setData(geojson);
    } else {
        addMarkers(geojson);
    }

    updateSummaryTable(filteredData, data);
}

function updateSummaryTable(filteredData, allData) {
    const summaryTableBody = document.getElementById('summaryTableBody');
    summaryTableBody.innerHTML = '';

    const totals = calculateTotals(allData);
    const filteredTotals = calculateTotals(filteredData);

    const rows = Object.keys(colors).map(type => {
        const typeLabel = type.replace('res-', 'Res. ').replace('ocupação', 'Ocupação').replace('hostel', 'Hostel').replace('his', 'HIS').replace('hotel', 'Hotel');
        const typeTotals = calculateTotals(allData.filter(point => point.TIPO && point.TIPO.toLowerCase().replace(/\s+/g, '-').replace('.', '') === type));
        const filteredTypeTotals = calculateTotals(filteredData.filter(point => point.TIPO && point.TIPO.toLowerCase().replace(/\s+/g, '-').replace('.', '') === type));

        const populationPercentage = typeTotals.totalPopulation ? (filteredTypeTotals.totalPopulation / typeTotals.totalPopulation * 100).toFixed(2) : 0;
        const unitsPercentage = typeTotals.totalUnits ? (filteredTypeTotals.totalUnits / typeTotals.totalUnits * 100).toFixed(2) : 0;

        return `
            <tr>
                <td>${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)}</td>
                <td>${filteredTypeTotals.totalPopulation} (${populationPercentage}%)</td>
                <td>${filteredTypeTotals.totalUnits} (${unitsPercentage}%)</td>
            </tr>
        `;
    }).join('');

    summaryTableBody.innerHTML = rows;
}

function calculateTotals(data) {
    let totalPopulation = 0;
    let totalUnits = 0;

    data.forEach(point => {
        totalPopulation += parseInt(point.POPULAÇÃO) || 0;
        totalUnits += parseInt(point.UNIDADES) || 0;
    });

    return { totalPopulation, totalUnits };
}

async function initMap() {
    const data = await loadGoogleSheetsData(dataUrl);

    // Populate bairro filter options
    const uniqueBairros = [...new Set(data.map(point => point.BAIRRO))];
    const bairroFilter = document.getElementById('bairroFilter');
    uniqueBairros.forEach(bairro => {
        const option = document.createElement('option');
        option.value = bairro;
        option.textContent = bairro;
        bairroFilter.appendChild(option);
    });

    const geojson = createGeoJSON(data);
    addMarkers(geojson);
    filterMarkers(data, 'all', 'all', 'all');

    document.getElementById('typeFilter').addEventListener('change', (e) => {
        filterMarkers(data, e.target.value, document.getElementById('bairroFilter').value, document.getElementById('statusFilter').value);
    });

    document.getElementById('bairroFilter').addEventListener('change', (e) => {
        filterMarkers(data, document.getElementById('typeFilter').value, e.target.value, document.getElementById('statusFilter').value);
    });

    document.getElementById('statusFilter').addEventListener('change', (e) => {
        filterMarkers(data, document.getElementById('typeFilter').value, document.getElementById('bairroFilter').value, e.target.value);
    });
}

initMap();
