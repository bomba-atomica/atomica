// SCOUT(#232) EDIT: the re-exported getDerivedAddress will lowercase its input; no change is needed here, and the hand lowercasing in payloads.ts (testSimpleAPTTransfer, requestAPT) becomes redundant.
export {
    constructSIWEMessage,
    getDerivedAddress,
    calculateAbstractDigest,
    serializeSIWEAbstractSignature,
    serializeSIWEAbstractPublicKey,
    SIWEAccountAuthenticator,
} from "@atomica/sdk";
