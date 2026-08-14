-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('IDLE', 'IN_TRANSIT', 'EMERGENCY', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "JourneyStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'DISPATCHED', 'OFFLINE');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('REPORTED', 'DISPATCHED', 'RESOLVED');

-- CreateTable
CREATE TABLE "Company" (
    "companyId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "Stop" (
    "stopId" TEXT NOT NULL,
    "stopName" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Stop_pkey" PRIMARY KEY ("stopId")
);

-- CreateTable
CREATE TABLE "Route" (
    "routeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "routeName" TEXT NOT NULL,
    "originStopId" TEXT NOT NULL,
    "destinationStopId" TEXT NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("routeId")
);

-- CreateTable
CREATE TABLE "RouteStop" (
    "routeId" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "stopOrder" INTEGER NOT NULL,

    CONSTRAINT "RouteStop_pkey" PRIMARY KEY ("routeId","stopId")
);

-- CreateTable
CREATE TABLE "Bus" (
    "busId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'IDLE',

    CONSTRAINT "Bus_pkey" PRIMARY KEY ("busId")
);

-- CreateTable
CREATE TABLE "Journey" (
    "journeyId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "currentStatus" "JourneyStatus" NOT NULL DEFAULT 'SCHEDULED',

    CONSTRAINT "Journey_pkey" PRIMARY KEY ("journeyId")
);

-- CreateTable
CREATE TABLE "Location" (
    "locationId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("locationId")
);

-- CreateTable
CREATE TABLE "EmergencyResponder" (
    "responderId" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "headquartersEmail" TEXT NOT NULL,

    CONSTRAINT "EmergencyResponder_pkey" PRIMARY KEY ("responderId")
);

-- CreateTable
CREATE TABLE "ResponderLocation" (
    "responderLocationId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "availabilityStatus" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',

    CONSTRAINT "ResponderLocation_pkey" PRIMARY KEY ("responderLocationId")
);

-- CreateTable
CREATE TABLE "Incident" (
    "incidentId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "incidentLocation" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "IncidentStatus" NOT NULL DEFAULT 'REPORTED',

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("incidentId")
);

-- CreateTable
CREATE TABLE "IncidentDispatch" (
    "dispatchId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "responderLocationId" TEXT NOT NULL,
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arrivedAt" TIMESTAMP(3),

    CONSTRAINT "IncidentDispatch_pkey" PRIMARY KEY ("dispatchId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_contactEmail_key" ON "Company"("contactEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Bus_plateNumber_key" ON "Bus"("plateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyResponder_headquartersEmail_key" ON "EmergencyResponder"("headquartersEmail");

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_originStopId_fkey" FOREIGN KEY ("originStopId") REFERENCES "Stop"("stopId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_destinationStopId_fkey" FOREIGN KEY ("destinationStopId") REFERENCES "Stop"("stopId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("routeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("stopId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bus" ADD CONSTRAINT "Bus_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("busId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("routeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponderLocation" ADD CONSTRAINT "ResponderLocation_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "EmergencyResponder"("responderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponderLocation" ADD CONSTRAINT "ResponderLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("locationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("journeyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentDispatch" ADD CONSTRAINT "IncidentDispatch_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("incidentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentDispatch" ADD CONSTRAINT "IncidentDispatch_responderLocationId_fkey" FOREIGN KEY ("responderLocationId") REFERENCES "ResponderLocation"("responderLocationId") ON DELETE RESTRICT ON UPDATE CASCADE;
