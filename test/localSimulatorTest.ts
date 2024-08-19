
import {ethers} from "hardhat";
import {
  loadFixture,
} from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";

const deploy = async () => {
  const [owner, alice] = await ethers.getSigners();
  // create an instance of CCIPLocalSimulator.sol smart contract.
  const localSimulatorFactory = await ethers.getContractFactory("CCIPLocalSimulator")
  const localSimulator = await localSimulatorFactory.connect(owner).deploy()

  // call the configuration() function to get Router contract address.
  const localSimulatorConfig : {
    chainSelector_: BigNumber;
    sourceRouter_ : string;
    destinationRouter_ : string;
    wrappedNative_ : string;
    linkToken_: string;
    ccipBnM_: string;
    ccipLnM_: string;
  } = await localSimulator.configuration()

  // deploy instances of CrossChainNameServiceRegister.sol, CrossChainNameServiceReceiver.sol and CrossChainNameServiceLookup.sol smart contracts
  const lookupFactory = await ethers.getContractFactory("CrossChainNameServiceLookup")
  const lookupSource = await lookupFactory.connect(owner).deploy()
  const lookupDestination = await lookupFactory.connect(owner).deploy()

  const registerFactory = await ethers.getContractFactory("CrossChainNameServiceRegister")
  const registerSource = await registerFactory.connect(owner).deploy(localSimulatorConfig.destinationRouter_, lookupSource.address)

  
  const receiverFactory = await ethers.getContractFactory("CrossChainNameServiceReceiver")
  const receiverDestination = await receiverFactory.connect(owner).deploy(localSimulatorConfig.destinationRouter_, lookupDestination.address, localSimulatorConfig.chainSelector_)

  // fund the CrossChainNameServiceRegister contract with 5 LINK tokens
  const tx = await localSimulator.requestLinkFromFaucet(registerSource.address, 5_000_000_000_000_000_000n);
  await tx.wait()

  return {localSimulator, localSimulatorConfig, lookupSource, lookupDestination, registerSource, receiverDestination, eoa: {owner, alice}}
}

describe("CrossChainNameService", () => {
  it("should successfully look up name<->address record on destination chain following  name<->address record registration on source chain",  async () => {
    const { localSimulatorConfig, lookupSource, lookupDestination, registerSource, receiverDestination, eoa: {owner, alice} } = await loadFixture(deploy);
    const GAS_LIMIT = 500_000;
    // set the address of the Cross Chain Name Service entities on source chain
    let tx = await lookupSource.connect(owner).setCrossChainNameServiceAddress(registerSource.address);
    await tx.wait()

    // set the address of the Cross Chain Name Service entities on destination chain
    tx = await lookupDestination.connect(owner).setCrossChainNameServiceAddress(receiverDestination.address);
    await tx.wait()

    // enable ccnsReceiverAddress and destination chain selector on the CrossChainNameServiceReceiver source chain contract
    tx = await registerSource.connect(owner).enableChain(localSimulatorConfig.chainSelector_, receiverDestination.address, GAS_LIMIT);
    await tx.wait()

    // register name for alice on the source chain
    tx = await registerSource.connect(alice).register("alice.ccns");
    await tx.wait()

    // look up name on the destination chain
    const name = await lookupDestination.lookup("alice.ccns");
    expect(name).to.equal(alice.address);
  })
})