import Papa from 'papaparse';

export async function loadJson<T>(filename: string): Promise<T> {
    const response = await fetch(`/data/${filename}`);
    if (!response.ok) throw new Error(`Failed to load ${filename}`);
    return response.json();
}

export async function loadCsv<T>(filename: string): Promise<T[]> {
    const response = await fetch(`/data/${filename}`);
    if (!response.ok) throw new Error(`Failed to load ${filename}`);
    const csvString = await response.text();
    return new Promise((resolve, reject) => {
        Papa.parse(csvString, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data as T[]),
            error: (error: any) => reject(error),
        });
    });
}

export const dataCache = {
    multipliers: null as any,
    hardwareMatrix: null as any,
    hardwareLookup: null as any,
    hardwareCatalog: null as any,
    doorStyles: null as any,
    railingMatrix: null as any,
    engineeredLumber: null as any,
    trimSwitches: null as any,
    osbSheeting: null as any,
    branches: null as any,
    customerOverrides: null as any,
    customerProfiles: null as any,
    knownIssues: null as any,
    customers: null as any,
};

export async function initializeData() {
    const [
        multipliers,
        hardwareMatrix,
        hardwareLookup,
        hardwareCatalog,
        doorStyles,
        railingMatrix,
        engineeredLumber,
        trimSwitches,
        osbSheeting,
        branches,
        customerOverrides,
        customerProfiles,
        knownIssues,
        customers,
    ] = await Promise.all([
        loadJson('multipliers.json'),
        loadJson('hardware_matrix.json'),
        loadJson('hardware_type_lookup.json'),
        loadJson('hardware_catalog.json'),
        loadJson('door_styles.json'),
        loadJson('railing_matrix.json'),
        loadJson('engineered_lumber.json'),
        loadJson('trim_switches.json'),
        loadJson('osb_sheeting.json'),
        loadJson('branches.json'),
        loadJson('customer_overrides.json'),
        loadJson('customer_profiles.json'),
        loadJson('known_issues.json'),
        loadCsv('customers.csv'),
    ]);

    dataCache.multipliers = multipliers;
    dataCache.hardwareMatrix = hardwareMatrix;
    dataCache.hardwareLookup = hardwareLookup;
    dataCache.hardwareCatalog = hardwareCatalog;
    dataCache.doorStyles = doorStyles;
    dataCache.railingMatrix = railingMatrix;
    dataCache.engineeredLumber = engineeredLumber;
    dataCache.trimSwitches = trimSwitches;
    dataCache.osbSheeting = osbSheeting;
    dataCache.branches = branches;
    dataCache.customerOverrides = customerOverrides;
    dataCache.customerProfiles = customerProfiles;
    dataCache.knownIssues = knownIssues;
    dataCache.customers = customers;

    return dataCache;
}
