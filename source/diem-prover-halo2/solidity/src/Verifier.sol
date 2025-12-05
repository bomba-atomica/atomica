
// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

contract Halo2Verifier {
    fallback(bytes calldata) external returns (bytes memory) {
        assembly ("memory-safe") {
            // Enforce that Solidity memory layout is respected
            let data := mload(0x40)
            if iszero(eq(data, 0x80)) {
                revert(0, 0)
            }

            let success := true
            let f_p := 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
            let f_q := 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001
            function validate_ec_point(x, y) -> valid {
                {
                    let x_lt_p := lt(x, 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47)
                    let y_lt_p := lt(y, 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47)
                    valid := and(x_lt_p, y_lt_p)
                }
                {
                    let y_square := mulmod(y, y, 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47)
                    let x_square := mulmod(x, x, 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47)
                    let x_cube := mulmod(x_square, x, 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47)
                    let x_cube_plus_3 := addmod(x_cube, 3, 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47)
                    let is_affine := eq(x_cube_plus_3, y_square)
                    valid := and(valid, is_affine)
                }
            }
            mstore(0x80, 14995256145016999084753548061694350686393945994841365873282964152566438024271)

        {
            let x := calldataload(0x0)
            mstore(0xa0, x)
            let y := calldataload(0x20)
            mstore(0xc0, y)
            success := and(validate_ec_point(x, y), success)
        }
mstore(0xe0, keccak256(0x80, 96))
{
            let hash := mload(0xe0)
            mstore(0x100, mod(hash, f_q))
            mstore(0x120, hash)
        }
mstore8(320, 1)
mstore(0x140, keccak256(0x120, 33))
{
            let hash := mload(0x140)
            mstore(0x160, mod(hash, f_q))
            mstore(0x180, hash)
        }
mstore8(416, 1)
mstore(0x1a0, keccak256(0x180, 33))
{
            let hash := mload(0x1a0)
            mstore(0x1c0, mod(hash, f_q))
            mstore(0x1e0, hash)
        }

        {
            let x := calldataload(0x40)
            mstore(0x200, x)
            let y := calldataload(0x60)
            mstore(0x220, y)
            success := and(validate_ec_point(x, y), success)
        }

        {
            let x := calldataload(0x80)
            mstore(0x240, x)
            let y := calldataload(0xa0)
            mstore(0x260, y)
            success := and(validate_ec_point(x, y), success)
        }
mstore(0x280, keccak256(0x1e0, 160))
{
            let hash := mload(0x280)
            mstore(0x2a0, mod(hash, f_q))
            mstore(0x2c0, hash)
        }

        {
            let x := calldataload(0xc0)
            mstore(0x2e0, x)
            let y := calldataload(0xe0)
            mstore(0x300, y)
            success := and(validate_ec_point(x, y), success)
        }

        {
            let x := calldataload(0x100)
            mstore(0x320, x)
            let y := calldataload(0x120)
            mstore(0x340, y)
            success := and(validate_ec_point(x, y), success)
        }
mstore(0x360, keccak256(0x2c0, 160))
{
            let hash := mload(0x360)
            mstore(0x380, mod(hash, f_q))
            mstore(0x3a0, hash)
        }
mstore(0x3c0, mod(calldataload(0x140), f_q))
mstore(0x3e0, mod(calldataload(0x160), f_q))
mstore(0x400, mod(calldataload(0x180), f_q))
mstore(0x420, mod(calldataload(0x1a0), f_q))
mstore(0x440, mod(calldataload(0x1c0), f_q))
mstore(0x460, mod(calldataload(0x1e0), f_q))
mstore(0x480, keccak256(0x3a0, 224))
{
            let hash := mload(0x480)
            mstore(0x4a0, mod(hash, f_q))
            mstore(0x4c0, hash)
        }
mstore8(1248, 1)
mstore(0x4e0, keccak256(0x4c0, 33))
{
            let hash := mload(0x4e0)
            mstore(0x500, mod(hash, f_q))
            mstore(0x520, hash)
        }

        {
            let x := calldataload(0x200)
            mstore(0x540, x)
            let y := calldataload(0x220)
            mstore(0x560, y)
            success := and(validate_ec_point(x, y), success)
        }
mstore(0x580, keccak256(0x520, 96))
{
            let hash := mload(0x580)
            mstore(0x5a0, mod(hash, f_q))
            mstore(0x5c0, hash)
        }

        {
            let x := calldataload(0x240)
            mstore(0x5e0, x)
            let y := calldataload(0x260)
            mstore(0x600, y)
            success := and(validate_ec_point(x, y), success)
        }
mstore(0x620, mulmod(mload(0x380), mload(0x380), f_q))
mstore(0x640, mulmod(mload(0x620), mload(0x620), f_q))
mstore(0x660, mulmod(mload(0x640), mload(0x640), f_q))
mstore(0x680, mulmod(mload(0x660), mload(0x660), f_q))
mstore(0x6a0, mulmod(mload(0x680), mload(0x680), f_q))
mstore(0x6c0, mulmod(mload(0x6a0), mload(0x6a0), f_q))
mstore(0x6e0, mulmod(mload(0x6c0), mload(0x6c0), f_q))
mstore(0x700, mulmod(mload(0x6e0), mload(0x6e0), f_q))
mstore(0x720, mulmod(mload(0x700), mload(0x700), f_q))
mstore(0x740, addmod(mload(0x720), 21888242871839275222246405745257275088548364400416034343698204186575808495616, f_q))
mstore(0x760, mulmod(mload(0x740), 21845492397480214137827955734036069473141043376196471776620668631523902619649, f_q))
mstore(0x780, mulmod(mload(0x760), 11423757818648818765461327411617109120243501240676889555478397529313037714234, f_q))
mstore(0x7a0, addmod(mload(0x380), 10464485053190456456785078333640165968304863159739144788219806657262770781383, f_q))
mstore(0x7c0, mulmod(mload(0x760), 18658909205715493985327367002986689246357274798059125448824250603171843521466, f_q))
mstore(0x7e0, addmod(mload(0x380), 3229333666123781236919038742270585842191089602356908894873953583403964974151, f_q))
mstore(0x800, mulmod(mload(0x760), 13677048343952077794467995888380402608453928821079198134318291065290235358859, f_q))
mstore(0x820, addmod(mload(0x380), 8211194527887197427778409856876872480094435579336836209379913121285573136758, f_q))
mstore(0x840, mulmod(mload(0x760), 9936069627611189518829255670237324269287146421271524553312532036927871056678, f_q))
mstore(0x860, addmod(mload(0x380), 11952173244228085703417150075019950819261217979144509790385672149647937438939, f_q))
mstore(0x880, mulmod(mload(0x760), 14158528901797138466244491986759313854666262535363044392173788062030301470987, f_q))
mstore(0x8a0, addmod(mload(0x380), 7729713970042136756001913758497961233882101865052989951524416124545507024630, f_q))
mstore(0x8c0, mulmod(mload(0x760), 4260969412351770314333984243767775737437927068151180798236715529158398853173, f_q))
mstore(0x8e0, addmod(mload(0x380), 17627273459487504907912421501489499351110437332264853545461488657417409642444, f_q))
mstore(0x900, mulmod(mload(0x760), 1, f_q))
mstore(0x920, addmod(mload(0x380), 21888242871839275222246405745257275088548364400416034343698204186575808495616, f_q))
{
            let prod := mload(0x7a0)

                prod := mulmod(mload(0x7e0), prod, f_q)
                mstore(0x940, prod)
            
                prod := mulmod(mload(0x820), prod, f_q)
                mstore(0x960, prod)
            
                prod := mulmod(mload(0x860), prod, f_q)
                mstore(0x980, prod)
            
                prod := mulmod(mload(0x8a0), prod, f_q)
                mstore(0x9a0, prod)
            
                prod := mulmod(mload(0x8e0), prod, f_q)
                mstore(0x9c0, prod)
            
                prod := mulmod(mload(0x920), prod, f_q)
                mstore(0x9e0, prod)
            
                prod := mulmod(mload(0x740), prod, f_q)
                mstore(0xa00, prod)
            
        }
mstore(0xa40, 32)
mstore(0xa60, 32)
mstore(0xa80, 32)
mstore(0xaa0, mload(0xa00))
mstore(0xac0, 21888242871839275222246405745257275088548364400416034343698204186575808495615)
mstore(0xae0, 21888242871839275222246405745257275088548364400416034343698204186575808495617)
success := and(eq(staticcall(gas(), 0x5, 0xa40, 0xc0, 0xa20, 0x20), 1), success)
{
            
            let inv := mload(0xa20)
            let v
        
                    v := mload(0x740)
                    mstore(1856, mulmod(mload(0x9e0), inv, f_q))
                    inv := mulmod(v, inv, f_q)
                
                    v := mload(0x920)
                    mstore(2336, mulmod(mload(0x9c0), inv, f_q))
                    inv := mulmod(v, inv, f_q)
                
                    v := mload(0x8e0)
                    mstore(2272, mulmod(mload(0x9a0), inv, f_q))
                    inv := mulmod(v, inv, f_q)
                
                    v := mload(0x8a0)
                    mstore(2208, mulmod(mload(0x980), inv, f_q))
                    inv := mulmod(v, inv, f_q)
                
                    v := mload(0x860)
                    mstore(2144, mulmod(mload(0x960), inv, f_q))
                    inv := mulmod(v, inv, f_q)
                
                    v := mload(0x820)
                    mstore(2080, mulmod(mload(0x940), inv, f_q))
                    inv := mulmod(v, inv, f_q)
                
                    v := mload(0x7e0)
                    mstore(2016, mulmod(mload(0x7a0), inv, f_q))
                    inv := mulmod(v, inv, f_q)
                mstore(0x7a0, inv)

        }
mstore(0xb00, mulmod(mload(0x780), mload(0x7a0), f_q))
mstore(0xb20, mulmod(mload(0x7c0), mload(0x7e0), f_q))
mstore(0xb40, mulmod(mload(0x800), mload(0x820), f_q))
mstore(0xb60, mulmod(mload(0x840), mload(0x860), f_q))
mstore(0xb80, mulmod(mload(0x880), mload(0x8a0), f_q))
mstore(0xba0, mulmod(mload(0x8c0), mload(0x8e0), f_q))
mstore(0xbc0, mulmod(mload(0x900), mload(0x920), f_q))
mstore(0xbe0, addmod(mload(0x3c0), 21888242871839275222246405745257275088548364400416034343698204186575808495575, f_q))
mstore(0xc00, mulmod(mload(0xbe0), mload(0x3e0), f_q))
mstore(0xc20, mulmod(mload(0x2a0), mload(0xc00), f_q))
mstore(0xc40, addmod(1, sub(f_q, mload(0x440)), f_q))
mstore(0xc60, mulmod(mload(0xc40), mload(0xbc0), f_q))
mstore(0xc80, addmod(mload(0xc20), mload(0xc60), f_q))
mstore(0xca0, mulmod(mload(0x2a0), mload(0xc80), f_q))
mstore(0xcc0, mulmod(mload(0x440), mload(0x440), f_q))
mstore(0xce0, addmod(mload(0xcc0), sub(f_q, mload(0x440)), f_q))
mstore(0xd00, mulmod(mload(0xce0), mload(0xb00), f_q))
mstore(0xd20, addmod(mload(0xca0), mload(0xd00), f_q))
mstore(0xd40, mulmod(mload(0x2a0), mload(0xd20), f_q))
mstore(0xd60, addmod(1, sub(f_q, mload(0xb00)), f_q))
mstore(0xd80, addmod(mload(0xb20), mload(0xb40), f_q))
mstore(0xda0, addmod(mload(0xd80), mload(0xb60), f_q))
mstore(0xdc0, addmod(mload(0xda0), mload(0xb80), f_q))
mstore(0xde0, addmod(mload(0xdc0), mload(0xba0), f_q))
mstore(0xe00, addmod(mload(0xd60), sub(f_q, mload(0xde0)), f_q))
mstore(0xe20, mulmod(mload(0x420), mload(0x160), f_q))
mstore(0xe40, addmod(mload(0x3c0), mload(0xe20), f_q))
mstore(0xe60, addmod(mload(0xe40), mload(0x1c0), f_q))
mstore(0xe80, mulmod(mload(0xe60), mload(0x460), f_q))
mstore(0xea0, mulmod(1, mload(0x160), f_q))
mstore(0xec0, mulmod(mload(0x380), mload(0xea0), f_q))
mstore(0xee0, addmod(mload(0x3c0), mload(0xec0), f_q))
mstore(0xf00, addmod(mload(0xee0), mload(0x1c0), f_q))
mstore(0xf20, mulmod(mload(0xf00), mload(0x440), f_q))
mstore(0xf40, addmod(mload(0xe80), sub(f_q, mload(0xf20)), f_q))
mstore(0xf60, mulmod(mload(0xf40), mload(0xe00), f_q))
mstore(0xf80, addmod(mload(0xd40), mload(0xf60), f_q))
mstore(0xfa0, mulmod(mload(0x720), mload(0x720), f_q))
mstore(0xfc0, mulmod(1, mload(0x720), f_q))
mstore(0xfe0, mulmod(mload(0xf80), mload(0x740), f_q))
mstore(0x1000, mulmod(mload(0x380), 1, f_q))
mstore(0x1020, addmod(mload(0x5a0), sub(f_q, mload(0x1000)), f_q))
mstore(0x1040, mulmod(mload(0x380), 6252951856119339508807713076978770803512896272623217303779254502899773638908, f_q))
mstore(0x1060, addmod(mload(0x5a0), sub(f_q, mload(0x1040)), f_q))
{
            let result := mulmod(mload(0x5a0), 1, f_q)
result := addmod(mulmod(mload(0x380), 21888242871839275222246405745257275088548364400416034343698204186575808495616, f_q), result, f_q)
mstore(4224, result)
        }
mstore(0x10a0, mulmod(1, mload(0x1020), f_q))
mstore(0x10c0, mulmod(15635291015719935713438692668278504285035468127792817039918949683676034856710, mload(0x380), f_q))
mstore(0x10e0, mulmod(mload(0x10c0), 1, f_q))
{
            let result := mulmod(mload(0x5a0), mload(0x10c0), f_q)
result := addmod(mulmod(mload(0x380), sub(f_q, mload(0x10e0)), f_q), result, f_q)
mstore(4352, result)
        }
mstore(0x1120, mulmod(6252951856119339508807713076978770803512896272623217303779254502899773638907, mload(0x380), f_q))
mstore(0x1140, mulmod(mload(0x1120), 6252951856119339508807713076978770803512896272623217303779254502899773638908, f_q))
{
            let result := mulmod(mload(0x5a0), mload(0x1120), f_q)
result := addmod(mulmod(mload(0x380), sub(f_q, mload(0x1140)), f_q), result, f_q)
mstore(4448, result)
        }
mstore(0x1180, mulmod(mload(0x10a0), mload(0x1060), f_q))
{
            let prod := mload(0x1080)

                prod := mulmod(mload(0x1100), prod, f_q)
                mstore(0x11a0, prod)
            
                prod := mulmod(mload(0x1160), prod, f_q)
                mstore(0x11c0, prod)
            
                prod := mulmod(mload(0x1180), prod, f_q)
                mstore(0x11e0, prod)
            
        }
mstore(0x1220, 32)
mstore(0x1240, 32)
mstore(0x1260, 32)
mstore(0x1280, mload(0x11e0))
mstore(0x12a0, 21888242871839275222246405745257275088548364400416034343698204186575808495615)
mstore(0x12c0, 21888242871839275222246405745257275088548364400416034343698204186575808495617)
success := and(eq(staticcall(gas(), 0x5, 0x1220, 0xc0, 0x1200, 0x20), 1), success)
{
            
            let inv := mload(0x1200)
            let v
        
                    v := mload(0x1180)
                    mstore(4480, mulmod(mload(0x11c0), inv, f_q))
                    inv := mulmod(v, inv, f_q)
                
                    v := mload(0x1160)
                    mstore(4448, mulmod(mload(0x11a0), inv, f_q))
                    inv := mulmod(v, inv, f_q)
                
                    v := mload(0x1100)
                    mstore(4352, mulmod(mload(0x1080), inv, f_q))
                    inv := mulmod(v, inv, f_q)
                mstore(0x1080, inv)

        }
{
            let result := mload(0x1080)
mstore(4832, result)
        }
mstore(0x1300, mulmod(mload(0x10a0), mload(0x1180), f_q))
{
            let result := mload(0x1100)
result := addmod(mload(0x1160), result, f_q)
mstore(4896, result)
        }
{
            let prod := mload(0x12e0)

                prod := mulmod(mload(0x1320), prod, f_q)
                mstore(0x1340, prod)
            
        }
mstore(0x1380, 32)
mstore(0x13a0, 32)
mstore(0x13c0, 32)
mstore(0x13e0, mload(0x1340))
mstore(0x1400, 21888242871839275222246405745257275088548364400416034343698204186575808495615)
mstore(0x1420, 21888242871839275222246405745257275088548364400416034343698204186575808495617)
success := and(eq(staticcall(gas(), 0x5, 0x1380, 0xc0, 0x1360, 0x20), 1), success)
{
            
            let inv := mload(0x1360)
            let v
        
                    v := mload(0x1320)
                    mstore(4896, mulmod(mload(0x12e0), inv, f_q))
                    inv := mulmod(v, inv, f_q)
                mstore(0x12e0, inv)

        }
mstore(0x1440, mulmod(mload(0x1300), mload(0x1320), f_q))
mstore(0x1460, mulmod(mload(0x4a0), mload(0x4a0), f_q))
mstore(0x1480, mulmod(mload(0x1460), mload(0x4a0), f_q))
mstore(0x14a0, mulmod(mload(0x1480), mload(0x4a0), f_q))
mstore(0x14c0, mulmod(mload(0x14a0), mload(0x4a0), f_q))
mstore(0x14e0, mulmod(mload(0x500), mload(0x500), f_q))
{
            let result := mulmod(mload(0x3c0), mload(0x1080), f_q)
mstore(5376, result)
        }
mstore(0x1520, mulmod(mload(0x1500), mload(0x12e0), f_q))
mstore(0x1540, mulmod(sub(f_q, mload(0x1520)), 1, f_q))
{
            let result := mulmod(mload(0x3e0), mload(0x1080), f_q)
mstore(5472, result)
        }
mstore(0x1580, mulmod(mload(0x1560), mload(0x12e0), f_q))
mstore(0x15a0, mulmod(sub(f_q, mload(0x1580)), mload(0x4a0), f_q))
mstore(0x15c0, mulmod(1, mload(0x4a0), f_q))
mstore(0x15e0, addmod(mload(0x1540), mload(0x15a0), f_q))
{
            let result := mulmod(mload(0x420), mload(0x1080), f_q)
mstore(5632, result)
        }
mstore(0x1620, mulmod(mload(0x1600), mload(0x12e0), f_q))
mstore(0x1640, mulmod(sub(f_q, mload(0x1620)), mload(0x1460), f_q))
mstore(0x1660, mulmod(1, mload(0x1460), f_q))
mstore(0x1680, addmod(mload(0x15e0), mload(0x1640), f_q))
{
            let result := mulmod(mload(0xfe0), mload(0x1080), f_q)
mstore(5792, result)
        }
mstore(0x16c0, mulmod(mload(0x16a0), mload(0x12e0), f_q))
mstore(0x16e0, mulmod(sub(f_q, mload(0x16c0)), mload(0x1480), f_q))
mstore(0x1700, mulmod(1, mload(0x1480), f_q))
mstore(0x1720, mulmod(mload(0xfc0), mload(0x1480), f_q))
mstore(0x1740, addmod(mload(0x1680), mload(0x16e0), f_q))
{
            let result := mulmod(mload(0x400), mload(0x1080), f_q)
mstore(5984, result)
        }
mstore(0x1780, mulmod(mload(0x1760), mload(0x12e0), f_q))
mstore(0x17a0, mulmod(sub(f_q, mload(0x1780)), mload(0x14a0), f_q))
mstore(0x17c0, mulmod(1, mload(0x14a0), f_q))
mstore(0x17e0, addmod(mload(0x1740), mload(0x17a0), f_q))
mstore(0x1800, mulmod(mload(0x17e0), 1, f_q))
mstore(0x1820, mulmod(mload(0x15c0), 1, f_q))
mstore(0x1840, mulmod(mload(0x1660), 1, f_q))
mstore(0x1860, mulmod(mload(0x1700), 1, f_q))
mstore(0x1880, mulmod(mload(0x1720), 1, f_q))
mstore(0x18a0, mulmod(mload(0x17c0), 1, f_q))
mstore(0x18c0, mulmod(1, mload(0x1300), f_q))
{
            let result := mulmod(mload(0x440), mload(0x1100), f_q)
result := addmod(mulmod(mload(0x460), mload(0x1160), f_q), result, f_q)
mstore(6368, result)
        }
mstore(0x1900, mulmod(mload(0x18e0), mload(0x1440), f_q))
mstore(0x1920, mulmod(sub(f_q, mload(0x1900)), 1, f_q))
mstore(0x1940, mulmod(mload(0x18c0), 1, f_q))
mstore(0x1960, mulmod(mload(0x1920), mload(0x500), f_q))
mstore(0x1980, mulmod(mload(0x1940), mload(0x500), f_q))
mstore(0x19a0, addmod(mload(0x1800), mload(0x1960), f_q))
mstore(0x19c0, mulmod(1, mload(0x10a0), f_q))
mstore(0x19e0, mulmod(1, mload(0x5a0), f_q))
mstore(0x1a00, 0x0000000000000000000000000000000000000000000000000000000000000001)
                    mstore(0x1a20, 0x0000000000000000000000000000000000000000000000000000000000000002)
mstore(0x1a40, mload(0x19a0))
success := and(eq(staticcall(gas(), 0x7, 0x1a00, 0x60, 0x1a00, 0x40), 1), success)
mstore(0x1a60, mload(0x1a00))
                    mstore(0x1a80, mload(0x1a20))
mstore(0x1aa0, mload(0xa0))
                    mstore(0x1ac0, mload(0xc0))
success := and(eq(staticcall(gas(), 0x6, 0x1a60, 0x80, 0x1a60, 0x40), 1), success)
mstore(0x1ae0, 0x1ea83b0fdd4ee530633c0d0dd338d5d629bf70b35c86b6403a006f3401d6cd41)
                    mstore(0x1b00, 0x2ec3e8e060096fb4259e2562154dca35082b3f25177202361a7d34544454bc20)
mstore(0x1b20, mload(0x1820))
success := and(eq(staticcall(gas(), 0x7, 0x1ae0, 0x60, 0x1ae0, 0x40), 1), success)
mstore(0x1b40, mload(0x1a60))
                    mstore(0x1b60, mload(0x1a80))
mstore(0x1b80, mload(0x1ae0))
                    mstore(0x1ba0, mload(0x1b00))
success := and(eq(staticcall(gas(), 0x6, 0x1b40, 0x80, 0x1b40, 0x40), 1), success)
mstore(0x1bc0, 0x20313edb34ec35193050f531c6280b988996dde59a83fe5239e1f5af104ebc43)
                    mstore(0x1be0, 0x0802a311e35c4cba3de31a06a6db74852dcd7ba68cbb19f27d331aa0c6b3c2f3)
mstore(0x1c00, mload(0x1840))
success := and(eq(staticcall(gas(), 0x7, 0x1bc0, 0x60, 0x1bc0, 0x40), 1), success)
mstore(0x1c20, mload(0x1b40))
                    mstore(0x1c40, mload(0x1b60))
mstore(0x1c60, mload(0x1bc0))
                    mstore(0x1c80, mload(0x1be0))
success := and(eq(staticcall(gas(), 0x6, 0x1c20, 0x80, 0x1c20, 0x40), 1), success)
mstore(0x1ca0, mload(0x2e0))
                    mstore(0x1cc0, mload(0x300))
mstore(0x1ce0, mload(0x1860))
success := and(eq(staticcall(gas(), 0x7, 0x1ca0, 0x60, 0x1ca0, 0x40), 1), success)
mstore(0x1d00, mload(0x1c20))
                    mstore(0x1d20, mload(0x1c40))
mstore(0x1d40, mload(0x1ca0))
                    mstore(0x1d60, mload(0x1cc0))
success := and(eq(staticcall(gas(), 0x6, 0x1d00, 0x80, 0x1d00, 0x40), 1), success)
mstore(0x1d80, mload(0x320))
                    mstore(0x1da0, mload(0x340))
mstore(0x1dc0, mload(0x1880))
success := and(eq(staticcall(gas(), 0x7, 0x1d80, 0x60, 0x1d80, 0x40), 1), success)
mstore(0x1de0, mload(0x1d00))
                    mstore(0x1e00, mload(0x1d20))
mstore(0x1e20, mload(0x1d80))
                    mstore(0x1e40, mload(0x1da0))
success := and(eq(staticcall(gas(), 0x6, 0x1de0, 0x80, 0x1de0, 0x40), 1), success)
mstore(0x1e60, mload(0x240))
                    mstore(0x1e80, mload(0x260))
mstore(0x1ea0, mload(0x18a0))
success := and(eq(staticcall(gas(), 0x7, 0x1e60, 0x60, 0x1e60, 0x40), 1), success)
mstore(0x1ec0, mload(0x1de0))
                    mstore(0x1ee0, mload(0x1e00))
mstore(0x1f00, mload(0x1e60))
                    mstore(0x1f20, mload(0x1e80))
success := and(eq(staticcall(gas(), 0x6, 0x1ec0, 0x80, 0x1ec0, 0x40), 1), success)
mstore(0x1f40, mload(0x200))
                    mstore(0x1f60, mload(0x220))
mstore(0x1f80, mload(0x1980))
success := and(eq(staticcall(gas(), 0x7, 0x1f40, 0x60, 0x1f40, 0x40), 1), success)
mstore(0x1fa0, mload(0x1ec0))
                    mstore(0x1fc0, mload(0x1ee0))
mstore(0x1fe0, mload(0x1f40))
                    mstore(0x2000, mload(0x1f60))
success := and(eq(staticcall(gas(), 0x6, 0x1fa0, 0x80, 0x1fa0, 0x40), 1), success)
mstore(0x2020, mload(0x540))
                    mstore(0x2040, mload(0x560))
mstore(0x2060, sub(f_q, mload(0x19c0)))
success := and(eq(staticcall(gas(), 0x7, 0x2020, 0x60, 0x2020, 0x40), 1), success)
mstore(0x2080, mload(0x1fa0))
                    mstore(0x20a0, mload(0x1fc0))
mstore(0x20c0, mload(0x2020))
                    mstore(0x20e0, mload(0x2040))
success := and(eq(staticcall(gas(), 0x6, 0x2080, 0x80, 0x2080, 0x40), 1), success)
mstore(0x2100, mload(0x5e0))
                    mstore(0x2120, mload(0x600))
mstore(0x2140, mload(0x19e0))
success := and(eq(staticcall(gas(), 0x7, 0x2100, 0x60, 0x2100, 0x40), 1), success)
mstore(0x2160, mload(0x2080))
                    mstore(0x2180, mload(0x20a0))
mstore(0x21a0, mload(0x2100))
                    mstore(0x21c0, mload(0x2120))
success := and(eq(staticcall(gas(), 0x6, 0x2160, 0x80, 0x2160, 0x40), 1), success)
mstore(0x21e0, mload(0x2160))
                    mstore(0x2200, mload(0x2180))
mstore(0x2220, 0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2)
            mstore(0x2240, 0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed)
            mstore(0x2260, 0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b)
            mstore(0x2280, 0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa)
mstore(0x22a0, mload(0x5e0))
                    mstore(0x22c0, mload(0x600))
mstore(0x22e0, 0x0fc39adcd55d130a2479c71142c73dba71e514fd8f4126cbd8cc8f46e36cca76)
            mstore(0x2300, 0x0f1737deda1b79db8015c710ba9e1fffb43bca1319a394b46fde5864e18d3a88)
            mstore(0x2320, 0x29c8bb8671b878f44ccb63d5d5aaa4168e7ad34472cb61873f827ef23abddbd8)
            mstore(0x2340, 0x2a4ac76a738c19dccbcc84f14caafb2b3d03352e82f6ad9253710b3b15691d49)
success := and(eq(staticcall(gas(), 0x8, 0x21e0, 0x180, 0x21e0, 0x20), 1), success)
success := and(eq(mload(0x21e0), 1), success)

            // Revert if anything fails
            if iszero(success) { revert(0, 0) }

            // Return empty bytes on success
            return(0, 0)

        }
    }
}
        