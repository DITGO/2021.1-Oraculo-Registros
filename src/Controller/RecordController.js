const Record = require("../Model/Record");
const { Section } = require("../Model/Section");
const Field = require("../Model/Field");
const History = require("../Model/History");
const { User } = require("../Model/User");
const { recordStatus } = require("../Model/Situation");

function generateRegisterNumber() {
  const date = new Date();
  const seq = date.getTime();
  return `${Math.round(seq)}/${date.getFullYear()}`;
}

async function findCurrentSection(req, res) {
  const { id } = req.params;
  const recordID = Number.parseInt(id);

  if (!Number.isFinite(recordID)) {
    return res.status(400).json({ error: "invalid record id" });
  }

  const history = await History.findAll({
    where: {
      record_id: recordID,
    },
  });

  const lastEntry = history[history.length - 1];

  return res.status(200).json({ current_section: lastEntry.destination_id });
}

async function getRecordByID(request, response) {
  const { id } = request.params;

  const record = await Record.findByPk(id);
  if (!record) {
    return response.status(400).json({ error: `Could not find record with id ${id}` });
  }

  return response.json(record);
}

async function getAllRecords(request, response) {
  const records = await Record.findAll();
  if (!records.length) {
    return response.status(204).json({ error: "could not find any record" });
  }

  // FIXME: we need to limit this
  return response.json(records);
}

async function createRecord(req, res) {
  const record = ({
    register_number,
    inclusion_date,
    city,
    state,
    requester,
    document_type,
    document_number,
    document_date,
    description,
    sei_number,
    receipt_form,
    contact_info,
    created_by,
  } = req.body);

  try {
    if (Number.parseInt(record.created_by, 10) < 1) {
      throw new Error("created_by -> invalid user id");
    }

    record.register_number = generateRegisterNumber();
    record.inclusion_date = new Date();
    record.assigned_to = record.created_by;

    const createdRecord = await Record.create(record);

    createdRecord.createSituation({ status: recordStatus.StatusPending });

    return res.status(200).json(createdRecord);
  } catch (error) {
    return res
      .status(500)
      .json({ error: `could not insert record into database: ${error}` });
  }
}

async function getRecordsByPage(req, res) {
  const { page } = req.params;
  const itemsPerPage = 4;

  try {
    const { rows, count } = await Record.findAndCountAll({
      limit: itemsPerPage,
      offset: page,
    });

    if (count === 0) {
      return res.status(204).json({ info: "there are no records matching this query" });
    }

    return res.status(200).json(rows);
  } catch (err) {
    console.error(`error: ${err}`);
    return res.status(500).json({ error: "could not get records" });
  }
}

async function forwardRecord(req, res) {
  const { id } = req.params;
  const { destination_id, origin_id, forwarded_by } = req.body;
  const recordID = Number.parseInt(id);
  const originID = Number.parseInt(origin_id);
  const destinationID = Number.parseInt(destination_id);
  const forwardedBy = Number.parseInt(forwarded_by);

  if (
    !Number.isFinite(originID) ||
    !Number.isFinite(destinationID) ||
    !Number.isFinite(forwardedBy)
  ) {
    return res.status(400).json({ error: "invalid section id provided" });
  }

  const record = await Record.findByPk(recordID);
  const originSection = await Section.findByPk(originID);
  const destinationSection = await Section.findByPk(destinationID);
  if (!record || !destinationSection || !originSection) {
    return res.status(404).json({ error: "session or record not found" });
  }

  // find user in database
  const user = await User.findByPk(forwardedBy);
  if (!user) {
    return res.status(404).json({ error: "could not find user in database" });
  }

  const history = {
    forwarded_by: forwardedBy,
    origin_id: originID,
    destination_id: destinationID,
    record_id: recordID,
  };

  // updates history
  // forward record to section
  await record.addSection(destinationSection);
  await History.create(history);

  return res.status(200).json({
    forwarded_by: `${user.name}`,
    forwarded_from: `${originSection.name}`,
    forwarded_to: `${destinationSection.name}`,
  });
}

async function getRecordSectionsByID(req, res) {
  const { id } = req.params;

  const record = await Record.findByPk(id, {
    include: {
      association: "sections",
      attributes: ["id", "name"],
    },
    through: {
      attributes: [],
    },
  });

  if (!record) {
    return res.status(404).json({ error: "record not found" });
  }

  return res.status(200).json(record.sections);
}

async function setRecordSituation(req, res) {
  const { id } = req.params;
  const { situation } = req.body;

  await Record.update({ situation: situation }, { where: { id: id } });

  return res.status(200).json({ message: "successfully changed situation" });
}

async function getFields(req, res) {
  Field.findAll({
    attributes: ["name", "description", "created_by"],
  }).then((fields) => {
    return res.status(200).json(fields);
  });
}

async function getRecordsHistory(req, res) {
  const { id } = req.params;
  const recordID = Number.parseInt(id);

  const record = await Record.findByPk(recordID);
  if (!record) {
    return res.status(404).json({ error: "record not found" });
  }

  const recordHistory = await History.findAll({
    where: {
      record_id: recordID,
    },
  });

  return res.status(200).json(recordHistory);
}

async function getTotalNumberOfRecords(req, res) {
  const allRecords = await Record.findAll();
  if (allRecords.length > 0) {
    return res.status(200).json({ count: `${allRecords.length}` });
  }

  return res.status(204).json({ message: "could not find records" });
}

module.exports = {
  getRecordByID,
  getAllRecords,
  createRecord,
  forwardRecord,
  getRecordSectionsByID,
  getRecordsByPage,
  setRecordSituation,
  getFields,
  getRecordsHistory,
  findCurrentSection,
  getTotalNumberOfRecords,
};
