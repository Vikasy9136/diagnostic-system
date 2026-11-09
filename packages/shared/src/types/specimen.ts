/**
 * Biological Specimen Types
 */
export enum SpecimenType {
  BLOOD = 'BLOOD',
  SERUM = 'SERUM',
  PLASMA = 'PLASMA',
  URINE = 'URINE',
  SWAB = 'SWAB',
  SPUTUM = 'SPUTUM',
  TISSUE = 'TISSUE',
  OTHER = 'OTHER',
}

/**
 * Phlebotomy Tube Colors & Additives
 */
export enum TubeType {
  EDTA_LAVENDER = 'EDTA_LAVENDER',
  SERUM_RED_GOLD = 'SERUM_RED_GOLD',
  SODIUM_CITRATE_BLUE = 'SODIUM_CITRATE_BLUE',
  SODIUM_FLUORIDE_GREY = 'SODIUM_FLUORIDE_GREY',
  HEPARIN_GREEN = 'HEPARIN_GREEN',
  URINE_CONTAINER = 'URINE_CONTAINER',
  VIRAL_TRANSPORT_MEDIA = 'VIRAL_TRANSPORT_MEDIA',
}

/**
 * Cold-chain temperature requirement category
 */
export enum StorageTemperature {
  AMBIENT = 'AMBIENT',           // 15°C to 25°C
  REFRIGERATED = 'REFRIGERATED', // 2°C to 8°C
  FROZEN = 'FROZEN',             // -20°C or colder
}

/**
 * Quality status of the received specimen during accessioning
 */
export enum SpecimenQualityStatus {
  INTACT = 'INTACT',
  HEMOLYZED = 'HEMOLYZED',
  LIPEMIC = 'LIPEMIC',
  INSUFFICIENT_VOLUME = 'INSUFFICIENT_VOLUME',
  LEAKED = 'LEAKED',
  CLOTTED = 'CLOTTED',
  TEMPERATURE_EXCURSION = 'TEMPERATURE_EXCURSION',
}

/**
 * Individual specimen unit in an order
 */
export interface SpecimenItem {
  id: string;
  barcode: string;
  testCode: string;
  testName: string;
  specimenType: SpecimenType;
  tubeType: TubeType;
  temperatureRequirement: StorageTemperature;
  collectedAt?: string;
  qualityStatus?: SpecimenQualityStatus;
  notes?: string;
}

