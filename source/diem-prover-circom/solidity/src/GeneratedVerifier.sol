// SPDX-License-Identifier: MIT
// Generated from circuit using ark-groth16
// Based on Semaphore's audited verifier implementation

pragma solidity >=0.8.23 <0.9.0;

/// @title GeneratedVerifier
/// @notice Groth16 verifier for the equality circuit
contract GeneratedVerifier {
    // Scalar field size (BN254 curve order)
    uint256 constant r = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key
    uint256 constant alphax = 17027652958803034172660426276845523350810245880032351690743225964136584402038;
    uint256 constant alphay = 3087919428722369092407889117846403063492345452857675249612447433392095757117;
    uint256 constant betax1 = 14356250763392248071225462620239518746897345464860535723965577842370665027278;
    uint256 constant betax2 = 7838789555061215769689992515194263424641816132616919971608475365612915699743;
    uint256 constant betay1 = 13890234284224683187403428132524670827498291957372587681161422969445490383781;
    uint256 constant betay2 = 1181787226121305069405693637842451717596620369622767676321023339679481116021;
    uint256 constant gammax1 = 21637737727512616522573091294780748872992363818563241255209560228559647330579;
    uint256 constant gammax2 = 9047934002597158206989950637038292332911746525377570730412515472537241609729;
    uint256 constant gammay1 = 6467465345611384626630913675597719347294840914896541437761147775545781062860;
    uint256 constant gammay2 = 6408683827389199757074847745948848347333070951162515495273595386096606107284;
    uint256 constant deltax1 = 20575155519525936049064933662547335804516216193111243970495298001090656458757;
    uint256 constant deltax2 = 10501916217966070330632583737722997405056006529872606304025524476396582264439;
    uint256 constant deltay1 = 4086445723103679869379237419177333225407954532111385014873466939150317220658;
    uint256 constant deltay2 = 16615216374651127360053387442212030966217197081847782622503307565180177156576;

    // IC (input commitments) - there are 2 public inputs
    uint256 constant IC0x = 4801511665085987159801047604011035811528256470005476005180313795878385839250;
    uint256 constant IC0y = 19747471792276423378140824941129033327983843478922247816372005394029179874276;
    uint256 constant IC1x = 11949997419911992229164730360909358122462283268184015772057683870714132492878;
    uint256 constant IC1y = 20558827831735210532293906814466190928835230354739939471223470199818115325842;
    uint256 constant IC2x = 20023969265697676971535898229486993935276426412920538065711332710454403384774;
    uint256 constant IC2y = 17573338142987387574718316139069776803270171806883797479458404516049213651608;


    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;
    uint16 constant pLastMem = 896;

    /// @notice Verify a Groth16 proof
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[] calldata _pubSignals
    ) external view returns (bool) {
        require(_pubSignals.length == 2, "Invalid number of public inputs");

        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(8000, 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(200, 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                // Load IC[0]
                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute linear combination vk_x = IC[0] + pubSignals[0]*IC[1] + ...
                let pubSignalsOffset := add(4, calldataload(96))
                let pubSignalsData := add(pubSignalsOffset, 32)

                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignalsData, 0)))
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignalsData, 32)))

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(_pVk))
                mstore(add(_pPairing, 416), mload(add(_pVk, 32)))

                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)

                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate all inputs
            checkField(calldataload(_pA))
            checkField(calldataload(add(_pA, 32)))

            checkField(calldataload(_pC))
            checkField(calldataload(add(_pC, 32)))

            // Validate public signals
            let pubSignalsOffset := add(4, calldataload(96))
            let pubSignalsLen := calldataload(pubSignalsOffset)
            let pubSignalsData := add(pubSignalsOffset, 32)

            for { let i := 0 } lt(i, pubSignalsLen) { i := add(i, 1) } {
                checkField(calldataload(add(pubSignalsData, mul(i, 32))))
            }

            // Check pairing
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
            return(0, 0x20)
        }
    }
}
